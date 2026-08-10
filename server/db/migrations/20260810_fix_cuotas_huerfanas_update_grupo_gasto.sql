-- Descripción: Fix de bug en update_grupo_gasto_installments (creada en
-- 20260722_rpc_update_grupo_gasto_installments.sql, parcheada en
-- 20260807_fix_update_grupo_gasto_installments_found.sql).
--
-- Bug: al editar un gasto grupal en cuotas y cambiar el método de pago a uno
-- que NO acepta cuotas, el cliente (GrupoGastoEditar.jsx) manda cuotas:
-- undefined → el RPC recibe p_cuotas: null → v_cuotas se calcula en 1 →
-- entra en la rama "v_cuotas <= 1", que solo hacía UPDATE de la fila padre
-- y NUNCA borraba las cuotas hijas (2, 3, ...) que habían quedado de la
-- versión anterior del gasto. Esas filas quedaban huérfanas en grupo_gastos,
-- seguían activas (estado = 'activo') y seguían sumando en vw_grupo_saldos y
-- en obtenerCuotasGrupal, duplicando el monto del gasto en los saldos del
-- grupo.
--
-- Fix: en la rama v_cuotas <= 1 también se borran las cuotas hijas
-- existentes (mismo DELETE que ya se hacía en la rama v_cuotas > 1, antes de
-- recrearlas). No hace falta borrar participantes de esas filas a mano: la
-- FK grupo_gasto_participantes.gasto_id → grupo_gastos.id tiene
-- ON DELETE CASCADE (ver schema.sql, tabla grupo_gasto_participantes), así
-- que se limpian solas al borrar las filas huérfanas.
--
-- Ejecutar en Supabase → SQL Editor. Reemplaza la función completa (mismo
-- cuerpo que 20260807_fix_update_grupo_gasto_installments_found.sql salvo el
-- DELETE agregado en la rama v_cuotas <= 1).

CREATE OR REPLACE FUNCTION update_grupo_gasto_installments(
    p_gasto_id         BIGINT,
    p_descripcion      TEXT,
    p_monto            NUMERIC(12,2),
    p_pagado_por       UUID,
    p_fecha            TEXT,
    p_participantes    UUID[],
    p_id_categoria     BIGINT DEFAULT NULL,
    p_id_metodo_pago   BIGINT DEFAULT NULL,
    p_nota             TEXT DEFAULT NULL,
    p_primera_cuota    TEXT DEFAULT NULL,
    p_cuotas           SMALLINT DEFAULT NULL
)
RETURNS grupo_gastos
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_gasto           grupo_gastos;
    v_gasto_padre_id  BIGINT;
    v_fecha_gasto     TIMESTAMPTZ;
    v_fecha_primera   DATE;
    v_cuotas          SMALLINT;
    v_monto_por_cuota NUMERIC(12,2);
    v_diferencia      NUMERIC(12,2);
    v_monto_cuota     NUMERIC(12,2);
    v_fecha_cuota     DATE;
    v_descripcion_cuota TEXT;
    v_gasto_id        BIGINT;
    v_n_participantes INT := COALESCE(array_length(p_participantes, 1), 0);
    v_base_part       NUMERIC(12,2);
    v_diferencia_part NUMERIC(12,2);
    v_idx_pagador     INT;
    v_participante    UUID;
    i                 SMALLINT;
    j                 INT;
BEGIN
    IF p_monto IS NULL OR p_monto <= 0 THEN
        RAISE EXCEPTION 'El monto debe ser mayor a cero';
    END IF;

    IF v_n_participantes < 1 THEN
        RAISE EXCEPTION 'Se requiere al menos un participante';
    END IF;

    -- Chequear FOUND (si el SELECT INTO encontró fila), no si id_gasto_padre
    -- es NULL — un gasto sin cuotas tiene id_gasto_padre NULL legítimamente.
    SELECT id_gasto_padre INTO v_gasto_padre_id FROM grupo_gastos
    WHERE id = p_gasto_id AND estado = 'activo';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El gasto no existe o ya fue anulado';
    END IF;

    v_cuotas := GREATEST(1, LEAST(18, COALESCE(p_cuotas, 1)));

    IF p_fecha IS NOT NULL AND btrim(p_fecha) != '' THEN
        v_fecha_gasto := (p_fecha || 'T12:00:00-03:00')::TIMESTAMPTZ;
    ELSE
        v_fecha_gasto := ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE::TEXT || 'T12:00:00-03:00')::TIMESTAMPTZ;
    END IF;

    IF v_cuotas <= 1 THEN
        -- Sin cuotas: un solo update sobre la fila padre.
        UPDATE grupo_gastos SET
            descripcion    = p_descripcion,
            monto          = p_monto,
            pagado_por     = p_pagado_por,
            fecha          = v_fecha_gasto,
            nota           = p_nota,
            id_categoria   = p_id_categoria,
            id_metodo_pago = p_id_metodo_pago,
            cuotas         = 1,
            numero_cuota   = NULL,
            id_gasto_padre = NULL
        WHERE id = p_gasto_id AND estado = 'activo'
        RETURNING * INTO v_gasto;

        -- Fix 20260810: si el gasto tenía cuotas hijas de una edición previa
        -- (ej. se cambió de tarjeta con cuotas a un método sin cuotas), hay
        -- que borrarlas acá también — antes solo se borraban en la rama
        -- v_cuotas > 1, dejando huérfanas las cuotas 2..N que duplicaban el
        -- monto en vw_grupo_saldos. El ON DELETE CASCADE de
        -- grupo_gasto_participantes.gasto_id limpia sus participantes solo.
        DELETE FROM grupo_gastos WHERE id_gasto_padre = p_gasto_id AND id != p_gasto_id;
    ELSE
        -- Con cuotas: p_monto es el TOTAL de la compra. Se recalculan los montos
        -- y fechas de todas las cuotas (padre + hijas), recreando las hijas para
        -- soportar que p_cuotas cambie la cantidad respecto a la que había antes.
        IF p_primera_cuota IS NULL OR p_primera_cuota !~ '^\d{4}-\d{2}(-\d{2})?$' THEN
            RAISE EXCEPTION 'Formato de fecha inválido, se espera YYYY-MM';
        END IF;
        v_fecha_primera := to_date(left(p_primera_cuota, 7) || '-01', 'YYYY-MM-DD');

        v_monto_por_cuota := FLOOR((p_monto / v_cuotas) * 100) / 100;
        v_diferencia := ROUND(p_monto - v_monto_por_cuota * v_cuotas, 2);
        v_monto_cuota := ROUND(v_monto_por_cuota + v_diferencia, 2);
        v_descripcion_cuota := CASE WHEN v_cuotas > 1
            THEN p_descripcion || ' (1/' || v_cuotas || ')'
            ELSE p_descripcion
        END;

        -- La fila editada (p_gasto_id) queda como cuota 1 / padre.
        UPDATE grupo_gastos SET
            descripcion    = v_descripcion_cuota,
            monto          = v_monto_cuota,
            pagado_por     = p_pagado_por,
            fecha          = v_fecha_primera,
            nota           = p_nota,
            id_categoria   = p_id_categoria,
            id_metodo_pago = p_id_metodo_pago,
            cuotas         = v_cuotas,
            numero_cuota   = 1,
            id_gasto_padre = p_gasto_id
        WHERE id = p_gasto_id AND estado = 'activo'
        RETURNING * INTO v_gasto;

        -- Borrar todas las cuotas hijas existentes (2..N de la versión anterior)
        -- y recrearlas con la nueva cantidad/montos/fechas.
        DELETE FROM grupo_gastos WHERE id_gasto_padre = p_gasto_id AND id != p_gasto_id;

        FOR i IN 2..v_cuotas LOOP
            v_fecha_cuota := v_fecha_primera + ((i - 1) * INTERVAL '1 month');
            v_descripcion_cuota := p_descripcion || ' (' || i || '/' || v_cuotas || ')';

            INSERT INTO grupo_gastos (
                grupo_id, descripcion, monto, pagado_por, fecha, nota, id_categoria,
                creado_por, cuotas, numero_cuota, id_gasto_padre, id_metodo_pago
            ) VALUES (
                v_gasto.grupo_id, v_descripcion_cuota, v_monto_por_cuota, p_pagado_por, v_fecha_cuota, p_nota, p_id_categoria,
                v_gasto.creado_por, v_cuotas, i, p_gasto_id, p_id_metodo_pago
            );
        END LOOP;
    END IF;

    IF v_gasto IS NULL THEN
        RAISE EXCEPTION 'El gasto no existe o ya fue anulado';
    END IF;

    -- Reemplazar participantes de la cuota editada (p_gasto_id) — el monto
    -- asignado se calcula sobre v_gasto.monto (la porción de ESA cuota, ya sea
    -- el total sin cuotas o el monto de la cuota 1 recién recalculado).
    DELETE FROM grupo_gasto_participantes WHERE gasto_id = p_gasto_id;

    v_idx_pagador := COALESCE(array_position(p_participantes, p_pagado_por), 1);
    v_base_part := FLOOR((v_gasto.monto / v_n_participantes) * 100) / 100;
    v_diferencia_part := ROUND(v_gasto.monto - v_base_part * v_n_participantes, 2);

    FOR j IN 1..v_n_participantes LOOP
        v_participante := p_participantes[j];
        INSERT INTO grupo_gasto_participantes (gasto_id, user_id, monto_asignado)
        VALUES (
            p_gasto_id, v_participante,
            CASE WHEN j = v_idx_pagador THEN ROUND(v_base_part + v_diferencia_part, 2) ELSE v_base_part END
        );
    END LOOP;

    -- Si hay cuotas hijas nuevas, también necesitan sus participantes (mismo
    -- criterio que create_grupo_gasto_installments).
    IF v_cuotas > 1 THEN
        FOR v_gasto_id IN
            SELECT id FROM grupo_gastos WHERE id_gasto_padre = p_gasto_id AND id != p_gasto_id
        LOOP
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
    END IF;

    RETURN v_gasto;
END;
$$;

-- ===========================================================================
-- VERIFICACIÓN (ejecutar después de crear la función)
-- ===========================================================================

-- 1) Confirmar que no quedan cuotas huérfanas activas sin padre válido:
-- SELECT id, id_gasto_padre, estado FROM grupo_gastos
-- WHERE id_gasto_padre IS NOT NULL
--   AND id != id_gasto_padre
--   AND id_gasto_padre NOT IN (SELECT id FROM grupo_gastos);

-- 2) Editar un gasto grupal en cuotas (tarjeta) y cambiar el método de pago a
-- uno que NO acepta cuotas (p_cuotas queda NULL) — confirmar que las cuotas
-- hijas anteriores se borraron:
-- SELECT update_grupo_gasto_installments(
--     <id_de_gasto_padre_en_cuotas>, 'DESCRIPCION EDITADA', 100.00,
--     '<uuid_pagador>', NULL, ARRAY['<uuid_pagador>']::UUID[],
--     NULL, <id_metodo_pago_sin_cuotas>
-- );
-- SELECT id, id_gasto_padre, numero_cuota, estado FROM grupo_gastos
-- WHERE id_gasto_padre = <id_de_gasto_padre_en_cuotas>;
-- (debería devolver una sola fila: la del padre)
