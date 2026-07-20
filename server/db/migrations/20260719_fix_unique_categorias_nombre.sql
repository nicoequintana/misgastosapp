-- Descripción: Corrige el constraint de unicidad de categorias.nombre.
-- Estaba definido como UNIQUE(nombre) global en Supabase (fuera del historial de
-- migraciones del repo), lo que impedía que dos usuarios distintos tuvieran una
-- categoría propia con el mismo nombre (ej. dos usuarios creando "SUPERMERCADO"
-- chocaban entre sí, sin relación alguna entre sus cuentas).
-- Cambios:
--   1. categorias: reemplaza UNIQUE(nombre) por UNIQUE(nombre, user_id)
--
-- IMPORTANTE: user_id acepta NULL (categorías globales). En Postgres, NULL no
-- colisiona consigo mismo en un UNIQUE compuesto, por lo que múltiples globales
-- con el mismo nombre NO quedarían bloqueadas por este índice. Si se requiere
-- nombre único entre las globales, agregar validación explícita aparte
-- (no cubierto por este cambio).
--
-- Ejecutar en Supabase → SQL Editor.
-- Verificaciones incluidas al final del script.

-- ===========================================================================
-- 1. REEMPLAZAR CONSTRAINT EN categorias
-- ===========================================================================

-- El nombre exacto del constraint puede variar según cómo se haya creado
-- (constraint declarativo vs. índice único). Cubrimos ambos casos.
ALTER TABLE categorias DROP CONSTRAINT IF EXISTS categorias_nombre_unique;
ALTER TABLE categorias DROP CONSTRAINT IF EXISTS categorias_nombre_key;
DROP INDEX IF EXISTS categorias_nombre_unique;
DROP INDEX IF EXISTS categorias_nombre_key;

ALTER TABLE categorias
    ADD CONSTRAINT categorias_nombre_user_id_unique UNIQUE (nombre, user_id);

-- ===========================================================================
-- VERIFICACIONES (ejecutar luego de aplicar la migración)
-- ===========================================================================

-- 1. Confirmar que el constraint viejo ya no existe y el nuevo sí:
-- SELECT conname, contype FROM pg_constraint
-- WHERE conrelid = 'categorias'::regclass AND contype = 'u';

-- 2. Confirmar que dos usuarios pueden tener el mismo nombre de categoría propia:
-- (ejecutar como usuarios distintos, o revisar datos existentes)
-- SELECT nombre, user_id, COUNT(*) FROM categorias GROUP BY nombre, user_id HAVING COUNT(*) > 1;
