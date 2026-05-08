-- Migración: Soporte de categorías personales por usuario
-- Fecha: 2026-05-06
-- Descripción: Agrega user_id nullable a categorías para que los usuarios puedan crear las propias.
--              Las categorías existentes (user_id = NULL) son globales y visibles para todos.
-- ============================================================

-- 1. Agregar la columna user_id (nullable para mantener las categorías globales existentes)
ALTER TABLE categorias
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Eliminar las políticas anteriores que bloqueaban todo write
DROP POLICY IF EXISTS "Allow select categories for all users" ON categorias;
DROP POLICY IF EXISTS "Prevent insert categories" ON categorias;
DROP POLICY IF EXISTS "Prevent update categories" ON categorias;
DROP POLICY IF EXISTS "Prevent delete categories" ON categorias;

-- 3. Crear las nuevas políticas:
--    SELECT: categorías globales (user_id IS NULL) + propias del usuario
--    INSERT: solo se puede insertar con el propio user_id
--    DELETE: solo se pueden eliminar las propias (user_id = auth.uid())
CREATE POLICY "categorias_select" ON categorias
    FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "categorias_insert" ON categorias
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "categorias_delete" ON categorias
    FOR DELETE USING (auth.uid() = user_id);

-- 4. Índice para acelerar el filtro por usuario
CREATE INDEX IF NOT EXISTS idx_categorias_user_id ON categorias(user_id);
