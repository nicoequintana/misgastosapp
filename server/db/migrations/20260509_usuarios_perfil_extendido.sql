-- Migración: Perfil extendido de usuario para registro con email/contraseña
-- Agrega nombre, email y avatar a la tabla usuarios.
-- Los usuarios de Google también se benefician (se sincronizan al hacer login).

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS nombre_completo VARCHAR(120),
    ADD COLUMN IF NOT EXISTS email          VARCHAR(255),
    ADD COLUMN IF NOT EXISTS avatar_url     TEXT;

-- Bucket de Storage para avatares de usuario.
-- Ejecutar en Supabase Dashboard → Storage → New bucket:
--   Nombre: avatars
--   Public: true
--
-- Luego agregar la siguiente policy RLS en el bucket:
--
-- Policy: "Usuario solo puede subir su propio avatar"
-- Allowed operation: INSERT, UPDATE, DELETE
-- Target roles: authenticated
-- USING expression:
--   (storage.foldername(name))[1] = auth.uid()::text
--
-- Policy: "Avatares públicos para lectura"
-- Allowed operation: SELECT
-- Target roles: public
-- USING expression: true
--
-- Verificar:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'usuarios'
-- ORDER BY ordinal_position;
