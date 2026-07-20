-- Descripción: Reemplaza el string-matching hardcodeado (nombre de método/categoría)
-- por flags explícitos, y agrega método de pago propio del usuario a gastos individuales.
-- Cambios:
--   1. metodos_pago: user_id (propietario, NULL = global), icono, acepta_cuotas, activo
--   2. categorias: es_prestamo
--   3. gastos: id_metodo_pago (FK a metodos_pago)
--   4. RLS en metodos_pago: lectura de propios + globales, mutación solo de propios
--
-- IMPORTANTE: Todos los cambios son aditivos. Las filas existentes reciben valores DEFAULT.
--
-- PENDIENTE DE EJECUCIÓN: verificado 2026-07-19 que esta migración NO se aplicó en Supabase
-- (error "Could not find the 'activo' column of 'metodos_pago' in the schema cache" al crear
-- un método de pago). Ejecutar en Supabase → SQL Editor antes de usar el formulario de
-- métodos de pago en Configuración.
--
-- Verificaciones incluidas al final del script.

-- ===========================================================================
-- 1. COLUMNAS NUEVAS EN metodos_pago
-- ===========================================================================

ALTER TABLE metodos_pago
    ADD COLUMN IF NOT EXISTS user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS icono          VARCHAR(60) NOT NULL DEFAULT 'payments',
    ADD COLUMN IF NOT EXISTS acepta_cuotas  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS activo         BOOLEAN NOT NULL DEFAULT true;

-- user_id = NULL identifica métodos globales (disponibles para todos los usuarios).

-- ===========================================================================
-- 2. COLUMNA NUEVA EN categorias
-- ===========================================================================

ALTER TABLE categorias
    ADD COLUMN IF NOT EXISTS es_prestamo BOOLEAN NOT NULL DEFAULT false;

-- ===========================================================================
-- 3. COLUMNA NUEVA EN gastos
-- ===========================================================================

ALTER TABLE gastos
    ADD COLUMN IF NOT EXISTS id_metodo_pago BIGINT REFERENCES metodos_pago(id);

-- ===========================================================================
-- 4. RLS EN metodos_pago
-- ===========================================================================
-- Lectura: métodos propios + globales (user_id IS NULL).
-- Mutación (update/delete): solo métodos propios.

ALTER TABLE metodos_pago ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metodos_pago_select" ON metodos_pago;
CREATE POLICY "metodos_pago_select" ON metodos_pago
    FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "metodos_pago_insert" ON metodos_pago;
CREATE POLICY "metodos_pago_insert" ON metodos_pago
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "metodos_pago_update" ON metodos_pago;
CREATE POLICY "metodos_pago_update" ON metodos_pago
    FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "metodos_pago_delete" ON metodos_pago;
CREATE POLICY "metodos_pago_delete" ON metodos_pago
    FOR DELETE USING (user_id = auth.uid());

-- ===========================================================================
-- VERIFICACIONES (ejecutar luego de aplicar la migración)
-- ===========================================================================

-- 1. Confirmar columnas nuevas:
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE (table_name = 'metodos_pago' AND column_name IN ('user_id', 'icono', 'acepta_cuotas', 'activo'))
--    OR (table_name = 'categorias' AND column_name = 'es_prestamo')
--    OR (table_name = 'gastos' AND column_name = 'id_metodo_pago');

-- 2. Confirmar que las policies de metodos_pago existen:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'metodos_pago';

-- 3. Confirmar que los métodos/categorías existentes no quedaron con acepta_cuotas/es_prestamo
--    en false de forma incorrecta (requiere backfill manual si aplica):
-- SELECT nombre, acepta_cuotas FROM metodos_pago;
-- SELECT nombre, es_prestamo FROM categorias;

-- 4. Confirmar que gastos existentes (id_metodo_pago NULL) siguen funcionando
--    con el flujo legacy hasta que se migren:
-- SELECT COUNT(*) FROM gastos WHERE id_metodo_pago IS NULL;
