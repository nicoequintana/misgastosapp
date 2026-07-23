-- Descripción: agrega nombre, apellido, teléfono y fecha de nacimiento a la
-- tabla usuarios para soportar el registro con email/password (además del
-- login existente con Google). Todas las columnas son nullable: los usuarios
-- existentes creados vía Google no tienen estos datos y no se hace backfill.
-- La obligatoriedad de estos campos para cuentas nuevas se valida en el
-- formulario de registro (client/src/pages/Registro.jsx), no en la DB.

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS nombre            TEXT,
    ADD COLUMN IF NOT EXISTS apellido          TEXT,
    ADD COLUMN IF NOT EXISTS telefono          TEXT,
    ADD COLUMN IF NOT EXISTS fecha_nacimiento  DATE;

ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_telefono_formato
        CHECK (telefono IS NULL OR telefono ~ '^\+?[0-9]{8,15}$'),
    ADD CONSTRAINT usuarios_fecha_nacimiento_pasado
        CHECK (fecha_nacimiento IS NULL OR fecha_nacimiento <= CURRENT_DATE),
    ADD CONSTRAINT usuarios_fecha_nacimiento_razonable
        CHECK (fecha_nacimiento IS NULL OR fecha_nacimiento >= '1900-01-01');

-- Las policies RLS existentes (usuarios_select/insert/update con
-- auth.uid() = id) ya cubren estas columnas nuevas sin cambios, porque RLS
-- aplica a nivel de fila, no de columna.

-- Verificar:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'usuarios'
-- ORDER BY ordinal_position;
