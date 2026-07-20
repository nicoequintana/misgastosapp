-- Descripción: Agrega soporte de cuotas con tarjeta de crédito a gastos grupales.
-- Cambios:
--   1. Columnas aditivas en grupo_gastos (cuotas, numero_cuota, id_gasto_padre, metodo_pago)
--   2. Índice en id_gasto_padre para consultas de agrupación
--   3. Reescritura de vw_grupo_saldos para excluir cuotas futuras del saldo actual
--
-- IMPORTANTE: Todos los cambios son aditivos. Las filas existentes reciben valores DEFAULT.
-- La vista mantiene comportamiento idéntico para gastos sin cuotas (cuotas = 1).
--
-- Ejecutar en Supabase → SQL Editor.
-- Verificaciones incluidas al final del script.

-- ===========================================================================
-- 1. COLUMNAS NUEVAS EN grupo_gastos
-- ===========================================================================

ALTER TABLE grupo_gastos
    ADD COLUMN IF NOT EXISTS cuotas        SMALLINT NOT NULL DEFAULT 1
                                            CHECK (cuotas BETWEEN 1 AND 18),
    ADD COLUMN IF NOT EXISTS numero_cuota  SMALLINT NOT NULL DEFAULT 1
                                            CHECK (numero_cuota >= 1),
    ADD COLUMN IF NOT EXISTS id_gasto_padre BIGINT REFERENCES grupo_gastos(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS metodo_pago   VARCHAR(60);

-- Índice para agrupar cuotas eficientemente
CREATE INDEX IF NOT EXISTS idx_grupo_gastos_gasto_padre
    ON grupo_gastos(id_gasto_padre)
    WHERE id_gasto_padre IS NOT NULL;

-- ===========================================================================
-- 2. VISTA vw_grupo_saldos — excluye cuotas futuras del saldo
-- ===========================================================================
-- Lógica:
--   - Gastos sin cuotas (cuotas = 1): se incluyen siempre (comportamiento actual).
--   - Gastos con cuotas (cuotas > 1): solo las cuotas cuya fecha <= CURRENT_DATE
--     afectan el saldo. Las cuotas futuras aparecen como "Movimientos futuros"
--     en el frontend y no cuentan en deudas actuales.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_grupo_saldos AS
WITH gastos_vigentes AS (
    -- Gastos de contado (sin cuotas) siempre vigentes.
    -- Cuotas: solo las que ya vencieron (fecha <= hoy).
    SELECT id, grupo_id, pagado_por, monto, estado
    FROM grupo_gastos
    WHERE estado = 'activo'
      AND (
          cuotas = 1
          OR (cuotas > 1 AND fecha::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
      )
),
pagos AS (
    -- Cuánto pagó cada usuario (suma de gastos donde es el pagador)
    SELECT
        g.grupo_id,
        g.pagado_por  AS user_id,
        SUM(g.monto)  AS total_pagado
    FROM gastos_vigentes g
    GROUP BY g.grupo_id, g.pagado_por
),
asignaciones AS (
    -- Cuánto le corresponde pagar a cada usuario según las divisiones
    SELECT
        g.grupo_id,
        p.user_id,
        SUM(p.monto_asignado) AS total_asignado
    FROM grupo_gasto_participantes p
    JOIN gastos_vigentes g ON g.id = p.gasto_id
    GROUP BY g.grupo_id, p.user_id
),
liquidaciones_enviadas AS (
    -- Cuánto envió cada usuario en liquidaciones confirmadas
    SELECT
        grupo_id,
        de_user_id    AS user_id,
        SUM(monto)    AS total_enviado
    FROM grupo_liquidaciones
    WHERE estado = 'confirmada'
    GROUP BY grupo_id, de_user_id
),
liquidaciones_recibidas AS (
    -- Cuánto recibió cada usuario en liquidaciones confirmadas
    SELECT
        grupo_id,
        para_user_id  AS user_id,
        SUM(monto)    AS total_recibido
    FROM grupo_liquidaciones
    WHERE estado = 'confirmada'
    GROUP BY grupo_id, para_user_id
),
miembros_activos AS (
    SELECT grupo_id, user_id
    FROM grupo_miembros
    WHERE estado = 'activo'
)
SELECT
    m.grupo_id,
    m.user_id,
    COALESCE(pa.total_pagado,    0) AS pagado,
    COALESCE(a.total_asignado,   0) AS asignado,
    COALESCE(le.total_enviado,   0) AS liquidado_enviado,
    COALESCE(lr.total_recibido,  0) AS liquidado_recibido,
    -- saldo_neto > 0: te deben | saldo_neto < 0: debés
    COALESCE(pa.total_pagado,   0)
    + COALESCE(le.total_enviado,  0)
    - COALESCE(a.total_asignado,  0)
    - COALESCE(lr.total_recibido, 0) AS saldo_neto
FROM miembros_activos m
LEFT JOIN pagos               pa ON pa.grupo_id = m.grupo_id AND pa.user_id = m.user_id
LEFT JOIN asignaciones         a ON  a.grupo_id = m.grupo_id AND  a.user_id = m.user_id
LEFT JOIN liquidaciones_enviadas  le ON le.grupo_id = m.grupo_id AND le.user_id = m.user_id
LEFT JOIN liquidaciones_recibidas lr ON lr.grupo_id = m.grupo_id AND lr.user_id = m.user_id;

-- ===========================================================================
-- VERIFICACIONES (ejecutar luego de aplicar la migración)
-- ===========================================================================

-- 1. Confirmar columnas nuevas en grupo_gastos:
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'grupo_gastos'
--   AND column_name IN ('cuotas', 'numero_cuota', 'id_gasto_padre', 'metodo_pago');

-- 2. Confirmar que la vista existe y trae datos:
-- SELECT * FROM vw_grupo_saldos LIMIT 5;

-- 3. Confirmar que gastos existentes sin cuotas siguen apareciendo igual:
-- SELECT COUNT(*) FROM grupo_gastos WHERE cuotas = 1;  -- debe ser igual al total actual
