-- Descripción: tabla para el flujo custom de recuperación de contraseña
-- (código de 6 dígitos enviado por email, expiración de 5 minutos). No usa
-- el flujo nativo resetPasswordForEmail de Supabase Auth: el código y el
-- token de reseteo se generan y validan desde el backend
-- (server/routes/authRecovery.js) usando supabaseAdmin (service role) para
-- forzar el cambio de contraseña sin sesión activa.

CREATE TABLE IF NOT EXISTS password_reset_codes (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email             TEXT NOT NULL,
    codigo_hash       TEXT NOT NULL,
    reset_token_hash  TEXT,
    intentos          SMALLINT NOT NULL DEFAULT 0,
    usado             BOOLEAN NOT NULL DEFAULT false,
    verificado        BOOLEAN NOT NULL DEFAULT false,
    fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_expiracion  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id ON password_reset_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email ON password_reset_codes(email);

ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;

-- Sin policies de select/insert/update/delete para anon/authenticated:
-- RLS habilitado sin policies deniega todo acceso salvo al service role
-- (que bypassa RLS). Esta tabla nunca debe ser accesible desde el frontend
-- con la anon key, solo desde el backend con supabaseAdmin — mismo criterio
-- que server/index.js aplica hoy para validar usuarios vía admin client.

-- codigo_hash: SHA-256 del código de 6 dígitos, nunca texto plano (mismo
-- patrón que generateFingerprint en server/utils.js).
-- reset_token_hash: SHA-256 del token de un solo uso (32 bytes random) que
-- se genera al verificar el código correctamente; se usa como credencial
-- del paso de cambio de contraseña en vez de reenviar el código de 6 dígitos.
-- intentos: contador de intentos fallidos de verificación por código, corta
-- fuerza bruta a nivel de fila además del rate limiting por IP.
-- verificado vs usado: verificado=true se marca al validar el código;
-- usado=true recién se marca cuando la contraseña efectivamente cambia.

-- Verificar:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'password_reset_codes'
-- ORDER BY ordinal_position;
