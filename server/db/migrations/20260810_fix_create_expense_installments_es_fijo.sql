-- Descripción: Fix de contrato en create_expense_installments (creada en
-- 20260720_rpc_create_expense_installments.sql).
--
-- Bug: la función hardcodea es_fijo = true en el INSERT de cada cuota (fila
-- inicial y loop de cuotas restantes), sin aceptar un parámetro para ese
-- valor. Hoy "funciona" porque el frontend (GastoWizard.jsx) siempre fuerza
-- es_fijo: true cuando el gasto es tarjeta/préstamo antes de llamar al RPC
-- — pero es una coincidencia de los dos caminos, no un contrato garantizado
-- por la firma de la función. Si en el futuro se permite marcar un
-- préstamo/tarjeta como variable, el RPC ignoraría ese valor en silencio.
--
-- Fix: agregar p_es_fijo boolean DEFAULT true (el DEFAULT preserva
-- compatibilidad con cualquier caller existente que no lo mande) y usarlo en
-- vez del literal true en ambos INSERT.
--
-- Ejecutar en Supabase → SQL Editor. Reemplaza la función completa (mismo
-- cuerpo que 20260720_rpc_create_expense_installments.sql salvo el nuevo
-- parámetro).

CREATE OR REPLACE FUNCTION create_expense_installments(
    p_descripcion      TEXT,
    p_monto_total      NUMERIC(12,2),
    p_cuotas           SMALLINT,
    p_fecha_primera_cuota TEXT,
    p_id_categoria     BIGINT DEFAULT NULL,
    p_id_metodo_pago   BIGINT DEFAULT NULL,
    p_es_fijo          BOOLEAN DEFAULT true
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
        v_fecha_primera, p_es_fijo, v_cuotas, 1, NULL
    ) RETURNING id INTO v_id_padre;

    UPDATE gastos SET id_gasto_padre = v_id_padre WHERE id = v_id_padre;

    FOR i IN 2..v_cuotas LOOP
        v_fecha_cuota := v_fecha_primera + ((i - 1) * INTERVAL '1 month');
        v_descripcion_cuota := p_descripcion || ' (' || i || '/' || v_cuotas || ')';

        INSERT INTO gastos (
            user_id, descripcion, monto, id_categoria, id_metodo_pago,
            fecha, es_fijo, cuotas, numero_cuota, id_gasto_padre
        ) VALUES (
            v_user_id, v_descripcion_cuota, v_monto_por_cuota, p_id_categoria, p_id_metodo_pago,
            v_fecha_cuota, p_es_fijo, v_cuotas, i, v_id_padre
        );
    END LOOP;

    RETURN QUERY SELECT * FROM gastos WHERE id_gasto_padre = v_id_padre ORDER BY numero_cuota;
END;
$$;

-- ===========================================================================
-- VERIFICACIÓN (ejecutar después de crear la función)
-- ===========================================================================

-- Crear un gasto en cuotas pasando p_es_fijo = false explícito y confirmar
-- que las cuotas creadas respetan ese valor (no quedan en true):
-- SELECT id, es_fijo, numero_cuota FROM create_expense_installments(
--     'TEST VARIABLE EN CUOTAS', 300.00, 3, '2026-09', NULL, NULL, false
-- );
-- (las 3 filas devueltas deberían tener es_fijo = false)

-- Confirmar que un caller que NO manda p_es_fijo sigue comportándose como
-- antes (DEFAULT true, compatibilidad hacia atrás):
-- SELECT id, es_fijo FROM create_expense_installments(
--     'TEST DEFAULT', 300.00, 3, '2026-09'
-- );
-- (las 3 filas deberían tener es_fijo = true)
