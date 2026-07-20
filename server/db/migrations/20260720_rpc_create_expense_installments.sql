-- Descripción: Función RPC para crear un gasto en cuotas (tarjeta/préstamo) de forma
-- atómica. Reemplaza el flujo actual en client/src/lib/db.js (createExpense), que hace
-- 3 operaciones separadas (insert cuota 1 → update id_gasto_padre → insert cuotas 2..N)
-- con "rollback" manual vía DELETE. Si el proceso pierde conexión entre esas 3 llamadas,
-- el rollback nunca corre y quedan cuotas huérfanas en la tabla gastos (viola ACID).
--
-- Esta función hace todo dentro de UNA transacción de Postgres: si cualquier INSERT
-- falla, la función entera hace ROLLBACK automático — no puede haber estado parcial.
--
-- SECURITY INVOKER (no DEFINER): la función corre con los permisos del usuario que
-- la invoca, así que las políticas RLS de "gastos" (gastos_insert: auth.uid() = user_id)
-- se siguen aplicando normalmente. No es un bypass de RLS.
--
-- Ejecutar en Supabase → SQL Editor.
-- Verificaciones incluidas al final del script.

-- ===========================================================================
-- 1. FUNCIÓN create_expense_installments
-- ===========================================================================

CREATE OR REPLACE FUNCTION create_expense_installments(
    p_descripcion      TEXT,
    p_monto_total      NUMERIC(12,2),
    p_cuotas           SMALLINT,
    p_fecha_primera_cuota TEXT,
    p_id_categoria     BIGINT DEFAULT NULL,
    p_id_metodo_pago   BIGINT DEFAULT NULL
)
RETURNS SETOF gastos
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_user_id         UUID := auth.uid();
    v_cuotas          SMALLINT := GREATEST(1, LEAST(120, p_cuotas));
    v_monto_por_cuota NUMERIC(12,2) := FLOOR((p_monto_total / v_cuotas) * 100) / 100;
    v_diferencia      NUMERIC(12,2) := ROUND(p_monto_total - v_monto_por_cuota * v_cuotas, 2);
    v_fecha_primera   DATE;
    v_id_padre        BIGINT;
    v_fecha_cuota     DATE;
    v_monto_cuota     NUMERIC(12,2);
    v_descripcion_cuota TEXT;
    i                 SMALLINT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No hay sesión de usuario activa';
    END IF;

    IF p_monto_total IS NULL OR p_monto_total <= 0 THEN
        RAISE EXCEPTION 'El monto debe ser mayor a cero';
    END IF;

    IF p_fecha_primera_cuota IS NULL OR btrim(p_fecha_primera_cuota) = '' THEN
        RAISE EXCEPTION 'Indicá en qué mes vence la primera cuota';
    END IF;

    -- p_fecha_primera_cuota llega como TEXT (no DATE) porque el front lo manda en
    -- formato YYYY-MM (mes sin día) — igual que hacía calcularCuotas() en JS antes
    -- del RPC. Si fuera DATE, PostgREST intentaría castear "2026-08" directo y
    -- fallaría con "invalid input syntax for type date" antes de llegar a este código.
    -- Se acepta YYYY-MM o YYYY-MM-DD y siempre se normaliza al día 1 del mes.
    IF p_fecha_primera_cuota !~ '^\d{4}-\d{2}(-\d{2})?$' THEN
        RAISE EXCEPTION 'Formato de fecha inválido, se espera YYYY-MM';
    END IF;
    v_fecha_primera := to_date(left(p_fecha_primera_cuota, 7) || '-01', 'YYYY-MM-DD');

    -- Cuota 1: incluye descripción sin sufijo si v_cuotas = 1, o "(1/N)" si hay más de una.
    -- La diferencia de redondeo (piso vs. división exacta) se absorbe siempre en la cuota 1,
    -- igual que calcularCuotas() en cuotasHelper.js — mismo comportamiento observable.
    v_descripcion_cuota := CASE WHEN v_cuotas > 1
        THEN p_descripcion || ' (1/' || v_cuotas || ')'
        ELSE p_descripcion
    END;
    v_monto_cuota := ROUND(v_monto_por_cuota + v_diferencia, 2);

    INSERT INTO gastos (
        user_id, descripcion, monto, id_categoria, id_metodo_pago,
        fecha, es_fijo, cuotas, numero_cuota, id_gasto_padre
    ) VALUES (
        v_user_id, v_descripcion_cuota, v_monto_cuota, p_id_categoria, p_id_metodo_pago,
        v_fecha_primera, true, v_cuotas, 1, NULL
    ) RETURNING id INTO v_id_padre;

    -- La primera cuota se vincula a sí misma como padre (mismo criterio que el código
    -- actual): getTarjetasEnCuotas filtra por id_gasto_padre IS NOT NULL.
    UPDATE gastos SET id_gasto_padre = v_id_padre WHERE id = v_id_padre;

    -- Cuotas 2..N: cada una desplaza 1 mes calendario desde la fecha de la cuota 1.
    FOR i IN 2..v_cuotas LOOP
        v_fecha_cuota := v_fecha_primera + ((i - 1) * INTERVAL '1 month');
        v_descripcion_cuota := p_descripcion || ' (' || i || '/' || v_cuotas || ')';

        INSERT INTO gastos (
            user_id, descripcion, monto, id_categoria, id_metodo_pago,
            fecha, es_fijo, cuotas, numero_cuota, id_gasto_padre
        ) VALUES (
            v_user_id, v_descripcion_cuota, v_monto_por_cuota, p_id_categoria, p_id_metodo_pago,
            v_fecha_cuota, true, v_cuotas, i, v_id_padre
        );
    END LOOP;

    RETURN QUERY SELECT * FROM gastos WHERE id_gasto_padre = v_id_padre ORDER BY numero_cuota;
END;
$$;

-- ===========================================================================
-- 2. VERIFICACIONES (ejecutar después de crear la función)
-- ===========================================================================

-- 2.1 La función existe y es SECURITY INVOKER (no DEFINER — respeta RLS del caller):
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'create_expense_installments';
-- Se espera: prosecdef = false (false = INVOKER, true = DEFINER)

-- 2.2 Prueba manual autenticado como un usuario real (reemplazar valores).
-- IMPORTANTE: en el SQL Editor los literales necesitan cast explícito o Postgres
-- no resuelve el overload correcto (p_cuotas es SMALLINT, no INTEGER por defecto):
-- SELECT * FROM create_expense_installments(
--     'NOTEBOOK NUEVA'::TEXT, 300000.00::NUMERIC(12,2), 3::SMALLINT, '2026-08'::TEXT, NULL::BIGINT, NULL::BIGINT
-- );
-- Se espera: 3 filas devueltas, montos que suman exactamente 300000.00,
-- todas con el mismo id_gasto_padre, fechas 2026-08-01 / 2026-09-01 / 2026-10-01.
-- NOTA: esto solo insertará filas reales si auth.uid() resuelve a un usuario —
-- el SQL Editor corre como rol admin sin sesión, así que fallará con
-- "No hay sesión de usuario activa" (P0001). Es el comportamiento esperado
-- (SECURITY INVOKER respetando RLS) — la prueba real se hace desde la app logueada.

-- 2.3 Prueba de atomicidad: forzar un error a mitad de camino (ej. p_id_categoria
-- inexistente si categorias tiene FK) y confirmar que NO queda ninguna fila:
-- SELECT * FROM gastos WHERE descripcion LIKE 'NOTEBOOK NUEVA%';
-- Se espera: 0 filas si la transacción abortó.
