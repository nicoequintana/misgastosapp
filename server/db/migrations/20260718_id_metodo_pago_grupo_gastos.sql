-- Descripción: Agrega id_metodo_pago (FK a metodos_pago) a grupo_gastos, en línea
-- con la misma columna ya existente en gastos individuales (ver 20260517).
-- Cambios:
--   1. grupo_gastos: id_metodo_pago (FK a metodos_pago)
--
-- IMPORTANTE: Cambio aditivo. Las filas existentes reciben NULL.
-- NOTA: Este archivo documenta un cambio que ya fue ejecutado manualmente en
-- Supabase (server/routes/grupos.js ya inserta/actualiza id_metodo_pago en
-- grupo_gastos en producción). Se agrega al repo para que quede historizado.
--
-- Ejecutar en Supabase → SQL Editor.
-- Verificaciones incluidas al final del script.

-- ===========================================================================
-- 1. COLUMNA NUEVA EN grupo_gastos
-- ===========================================================================

ALTER TABLE grupo_gastos
    ADD COLUMN IF NOT EXISTS id_metodo_pago BIGINT REFERENCES metodos_pago(id);

-- ===========================================================================
-- VERIFICACIONES (ejecutar luego de aplicar la migración)
-- ===========================================================================

-- 1. Confirmar columna nueva:
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'grupo_gastos' AND column_name = 'id_metodo_pago';

-- 2. Confirmar que gastos grupales existentes (id_metodo_pago NULL) siguen
--    funcionando con el flujo legacy hasta que se migren:
-- SELECT COUNT(*) FROM grupo_gastos WHERE id_metodo_pago IS NULL;
