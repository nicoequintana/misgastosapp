-- Migración: soporte de cuotas para pagos con tarjeta de crédito
-- Los gastos en cuotas se generan como registros fijos a partir del mes siguiente.
-- id_gasto_padre vincula las cuotas al gasto original para agrupación y trazabilidad.

ALTER TABLE gastos
    ADD COLUMN IF NOT EXISTS cuotas         SMALLINT DEFAULT 1 CHECK (cuotas BETWEEN 1 AND 18),
    ADD COLUMN IF NOT EXISTS numero_cuota   SMALLINT,
    ADD COLUMN IF NOT EXISTS id_gasto_padre BIGINT REFERENCES gastos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_gastos_id_gasto_padre ON gastos(id_gasto_padre);

-- Verificar:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'gastos' AND column_name IN ('cuotas', 'numero_cuota', 'id_gasto_padre');
