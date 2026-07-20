-- Descripción: Función RPC para crear un gasto GRUPAL en cuotas de forma atómica.
-- Encontrado durante R4 (consolidación de lógica de cuotas duplicada): el endpoint
-- POST /api/grupos/:grupoId/gastos-cuotas (server/routes/grupos.js) tenía el mismo
-- bug de atomicidad que create_expense_installments (C-01, migración 20260720),
-- pero con 3 pasos en vez de 2: insert cuota 1 -> insert cuotas 2..N -> insert
-- participantes de cada cuota. El rollback era manual (UPDATE estado='anulado'),
-- así que si el proceso perdía conexión entre pasos, quedaban cuotas grupales
-- huérfanas sin participantes o con participantes parciales.
--
-- Esta función hace todo dentro de UNA transacción de Postgres: si cualquier
-- INSERT falla, la función entera hace ROLLBACK automático.
--
-- SECURITY DEFINER (a diferencia de create_expense_installments, que es INVOKER):
-- este RPC es llamado desde el backend Node con supabaseAdmin (service role),
-- DESPUÉS de que el endpoint ya validó membresía, pagador y método de pago vía
-- requireAuth + validarParticipantesYMetodoPago. No repite esas validaciones —
-- confía en el caller server-side, igual que aceptar_invitacion_grupo.
--
-- Ejecutar en Supabase → SQL Editor.
-- Verificaciones incluidas al final del script.

-- ===========================================================================
-- 1. FUNCIÓN create_grupo_gasto_installments
-- ===========================================================================

CREATE OR REPLACE FUNCTION create_grupo_gasto_installments(
    p_grupo_id         BIGINT,
    p_descripcion      TEXT,
    p_monto_total      NUMERIC(12,2),
    p_cuotas           SMALLINT,
    p_fecha_primera_cuota TEXT,
    p_pagado_por       UUID,
    p_creado_por       UUID,
    p_participantes    UUID[],
    p_id_categoria     BIGINT DEFAULT NULL,
    p_id_metodo_pago   BIGINT DEFAULT NULL,
    p_nota             TEXT DEFAULT NULL
)
RETURNS SETOF grupo_gastos
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cuotas          SMALLINT := GREATEST(1, LEAST(18, p_cuotas));
    v_monto_por_cuota NUMERIC(12,2) := FLOOR((p_monto_total / v_cuotas) * 100) / 100;
    v_diferencia      NUMERIC(12,2) := ROUND(p_monto_total - v_monto_por_cuota * v_cuotas, 2);
    v_fecha_primera   DATE;
    v_id_padre        BIGINT;
    v_fecha_cuota     DATE;
    v_monto_cuota     NUMERIC(12,2);
    v_descripcion_cuota TEXT;
    v_gasto_id        BIGINT;
    v_participante    UUID;
    v_n_participantes INT := COALESCE(array_length(p_participantes, 1), 0);
    v_base_part       NUMERIC(12,2);
    v_diferencia_part NUMERIC(12,2);
    v_idx_pagador     INT;
    i                 SMALLINT;
    j                 INT;
BEGIN
    IF p_monto_total IS NULL OR p_monto_total <= 0 THEN
        RAISE EXCEPTION 'El monto debe ser mayor a cero';
    END IF;

    IF v_n_participantes < 1 THEN
        RAISE EXCEPTION 'Se requiere al menos un participante';
    END IF;

    IF p_fecha_primera_cuota IS NULL OR p_fecha_primera_cuota !~ '^\d{4}-\d{2}(-\d{2})?$' THEN
        RAISE EXCEPTION 'Formato de fecha inválido, se espera YYYY-MM';
    END IF;
    v_fecha_primera := to_date(left(p_fecha_primera_cuota, 7) || '-01', 'YYYY-MM-DD');

    -- Índice del pagador dentro de participantes (para asignarle la diferencia de
    -- redondeo), o 1 (primero) si el pagador no está en la lista de participantes
    -- — mismo criterio que calcularParticipantes() en grupos.js.
    v_idx_pagador := COALESCE(array_position(p_participantes, p_pagado_por), 1);

    -- Cuota 1
    v_descripcion_cuota := p_descripcion || ' (1/' || v_cuotas || ')';
    v_monto_cuota := ROUND(v_monto_por_cuota + v_diferencia, 2);

    INSERT INTO grupo_gastos (
        grupo_id, descripcion, monto, pagado_por, fecha, nota, id_categoria,
        creado_por, cuotas, numero_cuota, id_gasto_padre, id_metodo_pago
    ) VALUES (
        p_grupo_id, v_descripcion_cuota, v_monto_cuota, p_pagado_por, v_fecha_primera, p_nota, p_id_categoria,
        p_creado_por, v_cuotas, 1, NULL, p_id_metodo_pago
    ) RETURNING id INTO v_id_padre;

    UPDATE grupo_gastos SET id_gasto_padre = v_id_padre WHERE id = v_id_padre;

    -- Participantes de la cuota 1
    v_base_part := FLOOR((v_monto_cuota / v_n_participantes) * 100) / 100;
    v_diferencia_part := ROUND(v_monto_cuota - v_base_part * v_n_participantes, 2);
    FOR j IN 1..v_n_participantes LOOP
        v_participante := p_participantes[j];
        INSERT INTO grupo_gasto_participantes (gasto_id, user_id, monto_asignado)
        VALUES (
            v_id_padre, v_participante,
            CASE WHEN j = v_idx_pagador THEN ROUND(v_base_part + v_diferencia_part, 2) ELSE v_base_part END
        );
    END LOOP;

    -- Cuotas 2..N + sus participantes
    FOR i IN 2..v_cuotas LOOP
        v_fecha_cuota := v_fecha_primera + ((i - 1) * INTERVAL '1 month');
        v_descripcion_cuota := p_descripcion || ' (' || i || '/' || v_cuotas || ')';

        INSERT INTO grupo_gastos (
            grupo_id, descripcion, monto, pagado_por, fecha, nota, id_categoria,
            creado_por, cuotas, numero_cuota, id_gasto_padre, id_metodo_pago
        ) VALUES (
            p_grupo_id, v_descripcion_cuota, v_monto_por_cuota, p_pagado_por, v_fecha_cuota, p_nota, p_id_categoria,
            p_creado_por, v_cuotas, i, v_id_padre, p_id_metodo_pago
        ) RETURNING id INTO v_gasto_id;

        v_base_part := FLOOR((v_monto_por_cuota / v_n_participantes) * 100) / 100;
        v_diferencia_part := ROUND(v_monto_por_cuota - v_base_part * v_n_participantes, 2);
        FOR j IN 1..v_n_participantes LOOP
            v_participante := p_participantes[j];
            INSERT INTO grupo_gasto_participantes (gasto_id, user_id, monto_asignado)
            VALUES (
                v_gasto_id, v_participante,
                CASE WHEN j = v_idx_pagador THEN ROUND(v_base_part + v_diferencia_part, 2) ELSE v_base_part END
            );
        END LOOP;
    END LOOP;

    RETURN QUERY SELECT * FROM grupo_gastos WHERE id_gasto_padre = v_id_padre ORDER BY numero_cuota;
END;
$$;

-- ===========================================================================
-- 2. VERIFICACIONES (ejecutar después de crear la función)
-- ===========================================================================

-- 2.1 La función existe y es SECURITY DEFINER (corre con permisos del backend,
-- no del usuario final — el endpoint ya validó todo antes de llamar al RPC):
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'create_grupo_gasto_installments';
-- Se espera: prosecdef = true

-- 2.2 Prueba manual (reemplazar IDs reales de grupo/usuarios de tu entorno):
-- SELECT * FROM create_grupo_gasto_installments(
--     1::BIGINT, 'VIAJE'::TEXT, 300000.00::NUMERIC(12,2), 3::SMALLINT, '2026-08'::TEXT,
--     '<uuid-pagador>'::UUID, '<uuid-creador>'::UUID,
--     ARRAY['<uuid-pagador>', '<uuid-participante-2>']::UUID[],
--     NULL::BIGINT, NULL::BIGINT, NULL::TEXT
-- );
-- Se espera: 3 filas devueltas, montos que suman 300000.00, mismo id_gasto_padre.
-- Verificar también grupo_gasto_participantes: 2 filas por cada cuota (6 en total).

-- 2.3 Prueba de atomicidad: forzar un error (ej. UUID de participante inexistente
-- en auth.users, que viola la FK de grupo_gasto_participantes) y confirmar que
-- NO queda ninguna fila en grupo_gastos ni grupo_gasto_participantes:
-- SELECT * FROM grupo_gastos WHERE descripcion LIKE 'VIAJE%';
-- Se espera: 0 filas si la transacción abortó.
