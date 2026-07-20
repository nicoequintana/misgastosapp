-- Descripción: Corrige las políticas RLS de la tabla categorias.
-- Elimina cualquier política permisiva anterior que permitía leer TODAS las categorías
-- sin filtrar por usuario. La nueva política garantiza que cada usuario ve solo:
--   - Categorías globales (user_id IS NULL)
--   - Sus propias categorías (user_id = auth.uid())

-- Eliminar políticas viejas (pueden existir con estos nombres del schema original)
DROP POLICY IF EXISTS "Read categories for all" ON categorias;
DROP POLICY IF EXISTS "Allow select categories for all users" ON categorias;
DROP POLICY IF EXISTS "Prevent insert categories" ON categorias;
DROP POLICY IF EXISTS "Prevent update categories" ON categorias;
DROP POLICY IF EXISTS "Prevent delete categories" ON categorias;

-- Eliminar políticas actuales por si ya existen (para recrearlas limpias)
DROP POLICY IF EXISTS "categorias_select" ON categorias;
DROP POLICY IF EXISTS "categorias_insert" ON categorias;
DROP POLICY IF EXISTS "categorias_delete" ON categorias;

-- Recrear políticas correctas
CREATE POLICY "categorias_select" ON categorias
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "categorias_insert" ON categorias
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "categorias_delete" ON categorias
  FOR DELETE USING (auth.uid() = user_id);

-- Verificar políticas activas:
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'categorias';
