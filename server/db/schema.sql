-- ============================================================================
-- server/db/schema.sql — TusGastosApp (MisGastosApp)
-- ============================================================================
-- RECONSTRUCCIÓN BEST-EFFORT — fecha 2026-07-18
--
-- Este archivo se había perdido (o nunca se creó) pese a estar referenciado
-- como "fuente de verdad" del schema en CLAUDE.md y TECHNICAL_DOCS.md.
-- Se reconstruyó combinando:
--   1. Las migraciones incrementales existentes en server/db/migrations/
--      (20260514_fix_rls_categorias.sql, 20260515_cuotas_grupales.sql,
--       20260517_flags_metodo_pago_categoria.sql,
--       20260718_id_metodo_pago_grupo_gastos.sql)
--   2. El código real que consume Supabase (client/src/lib/db.js,
--      server/routes/grupos.js, server/index.js, server/services/notificacionesDb.js)
--   3. TECHNICAL_DOCS.md, verificado contra el código real (algunas partes,
--      como la RLS de metodos_pago, estaban desactualizadas — ver notas abajo).
--
-- IMPORTANTE: Si hay discrepancia entre este archivo y la Supabase real,
-- LA SUPABASE REAL MANDA. Nicolás debería confirmar este schema corriendo en
-- el proyecto real (SQL Editor de Supabase):
--
--   SELECT table_name, column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--   ORDER BY table_name, ordinal_position;
--
--   SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
--
-- Las tablas de "Grupos de Gastos Compartidos" (grupos_gastos, grupo_miembros,
-- grupo_invitaciones, grupo_gastos, grupo_gasto_participantes,
-- grupo_liquidaciones) NO tienen migración `.sql` en el repo — TECHNICAL_DOCS.md
-- menciona migraciones `20260507_grupos_gastos_compartidos.sql` y
-- `20260509_cuotas_tarjeta_credito.sql` que no existen en el filesystem actual.
-- Esas tablas se reconstruyeron desde el código (db.js, grupos.js) y desde la
-- tabla-resumen de TECHNICAL_DOCS.md — MARCAR TODO LO NO CONFIRMADO POR CÓDIGO
-- como "INFERIDO, VERIFICAR".
-- ============================================================================


-- ============================================================================
-- 1. GASTOS PERSONALES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- categorias
-- Clasifica los gastos del usuario. Global (user_id IS NULL) o personal.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = global
    nombre          VARCHAR(255) NOT NULL,
    icono           VARCHAR(50) DEFAULT 'label', -- INFERIDO, VERIFICAR: default exacto y longitud
    es_prestamo     BOOLEAN NOT NULL DEFAULT false, -- agregado en 20260517_flags_metodo_pago_categoria.sql
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT now(), -- INFERIDO, VERIFICAR: nombre/tipo exacto de columna de auditoría
    CONSTRAINT categorias_nombre_user_id_unique UNIQUE (nombre, user_id) -- agregado en 20260719_fix_unique_categorias_nombre.sql
);

ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

-- Políticas vigentes según migración 20260514_fix_rls_categorias.sql.
-- No hay política de UPDATE (código no la usa).
DROP POLICY IF EXISTS "categorias_select" ON categorias;
CREATE POLICY "categorias_select" ON categorias
    FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "categorias_insert" ON categorias;
CREATE POLICY "categorias_insert" ON categorias
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "categorias_delete" ON categorias;
CREATE POLICY "categorias_delete" ON categorias
    FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_categorias_user_id ON categorias(user_id);


-- ----------------------------------------------------------------------------
-- metodos_pago
-- Métodos de pago. Globales (user_id IS NULL) o personales del usuario.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metodos_pago (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL, -- INFERIDO, VERIFICAR: longitud exacta
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- agregado en 20260517; NULL = global
    icono           VARCHAR(60) NOT NULL DEFAULT 'payments',
    acepta_cuotas   BOOLEAN NOT NULL DEFAULT false,
    activo          BOOLEAN NOT NULL DEFAULT true, -- INFERIDO, VERIFICAR: default exacto
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT now() -- INFERIDO, VERIFICAR
);

ALTER TABLE metodos_pago ENABLE ROW LEVEL SECURITY;

-- Políticas vigentes según migración 20260517_flags_metodo_pago_categoria.sql.
-- NOTA DE DISCREPANCIA: TECHNICAL_DOCS.md (sección "Políticas RLS", tabla resumen)
-- dice `metodos_pago: SELECT todos / INSERT false / UPDATE false / DELETE false`,
-- lo cual está DESACTUALIZADO. El código real (client/src/lib/db.js:
-- createPaymentMethod, updatePaymentMethod, deletePaymentMethod) y la migración
-- 20260517 confirman que hoy existen policies de insert/update/delete atadas a
-- auth.uid() = user_id. Se usa acá la versión real (migración + código).
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


-- ----------------------------------------------------------------------------
-- gastos
-- Registro central de gastos del usuario. Soporta cuotas de tarjeta y préstamos.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gastos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL, -- se guarda en MAYÚSCULAS (regla de negocio en db.js, no en DB)
    monto           NUMERIC(12,2) NOT NULL CHECK (monto > 0), -- INFERIDO, VERIFICAR: CHECK explícito en DB (la validación hoy vive en el frontend/backend)
    id_categoria    BIGINT REFERENCES categorias(id),
    id_metodo_pago  BIGINT REFERENCES metodos_pago(id), -- agregado en 20260517_flags_metodo_pago_categoria.sql
    fecha           TIMESTAMPTZ NOT NULL, -- código usa filtros gte/lt de fecha; puede ser DATE en la Supabase real — VERIFICAR
    es_fijo         BOOLEAN NOT NULL DEFAULT false,
    huella_digital  VARCHAR(64), -- SHA-256 para idempotencia n8n (server/utils.js: generateFingerprint)
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT now(),
    cuotas          SMALLINT NOT NULL DEFAULT 1 CHECK (cuotas BETWEEN 1 AND 120), -- INFERIDO, VERIFICAR: tope real; createExpense en db.js usa min(120, ...) pero grupo_gastos usa tope 18
    numero_cuota    SMALLINT,
    id_gasto_padre  BIGINT REFERENCES gastos(id) ON DELETE CASCADE -- autoref en la primera cuota
);

ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

-- Política RLS estándar de aislamiento por usuario (CLAUDE.md sección 7).
-- No hay migración específica en el repo para esta tabla — INFERIDO desde
-- TECHNICAL_DOCS.md y el patrón usado en el resto del proyecto.
DROP POLICY IF EXISTS "gastos_select" ON gastos; -- INFERIDO, VERIFICAR: nombre real de policy
CREATE POLICY "gastos_select" ON gastos
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "gastos_insert" ON gastos; -- INFERIDO, VERIFICAR
CREATE POLICY "gastos_insert" ON gastos
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "gastos_update" ON gastos; -- INFERIDO, VERIFICAR
CREATE POLICY "gastos_update" ON gastos
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "gastos_delete" ON gastos; -- INFERIDO, VERIFICAR
CREATE POLICY "gastos_delete" ON gastos
    FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_gastos_user_id        ON gastos(user_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha           ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_id_categoria     ON gastos(id_categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_es_fijo          ON gastos(es_fijo);
CREATE INDEX IF NOT EXISTS idx_gastos_huella_digital   ON gastos(huella_digital);
CREATE INDEX IF NOT EXISTS idx_gastos_id_gasto_padre   ON gastos(id_gasto_padre);


-- ----------------------------------------------------------------------------
-- categorias_ingresos
-- Categorías para clasificar ingresos.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias_ingresos (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = global
    nombre  VARCHAR(255) NOT NULL,
    activa  BOOLEAN NOT NULL DEFAULT true -- INFERIDO, VERIFICAR: default exacto
);

ALTER TABLE categorias_ingresos ENABLE ROW LEVEL SECURITY;

-- getIncomeCategories (db.js) solo filtra por activa=true y no acota por user_id
-- en la query — el filtro de visibilidad (global + propia) recae en RLS.
DROP POLICY IF EXISTS "categorias_ingresos_select" ON categorias_ingresos; -- INFERIDO, VERIFICAR
CREATE POLICY "categorias_ingresos_select" ON categorias_ingresos
    FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- ingresos
-- Ingresos del usuario. Puede haber múltiples registros por mes.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingresos (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    monto                NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    fecha                DATE NOT NULL,
    descripcion          TEXT,
    origen               VARCHAR(30) DEFAULT 'manual', -- valores vistos en código: 'manual'
    categoria_id         BIGINT REFERENCES categorias_ingresos(id),
    recurrente_id        BIGINT REFERENCES ingresos_recurrentes(id), -- ver definición de tabla más abajo
    fecha_creacion       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ingresos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ingresos_select" ON ingresos; -- INFERIDO, VERIFICAR
CREATE POLICY "ingresos_select" ON ingresos
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ingresos_insert" ON ingresos; -- INFERIDO, VERIFICAR
CREATE POLICY "ingresos_insert" ON ingresos
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ingresos_update" ON ingresos; -- INFERIDO, VERIFICAR
CREATE POLICY "ingresos_update" ON ingresos
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ingresos_delete" ON ingresos; -- INFERIDO, VERIFICAR
CREATE POLICY "ingresos_delete" ON ingresos
    FOR DELETE USING (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- ingresos_recurrentes
-- Plantillas de ingresos esperados mensualmente.
-- NOTA: se declara después de `ingresos` en la lectura del código, pero debe
-- crearse ANTES porque `ingresos.recurrente_id` la referencia. Reordenado acá
-- para que el script sea ejecutable de punta a punta.
-- ----------------------------------------------------------------------------
-- (mover CREATE TABLE ingresos_recurrentes antes de ingresos si se ejecuta este
--  archivo tal cual de punta a punta — ver nota al pie del archivo)


-- ============================================================================
-- 2. PERFIL DE USUARIO Y NOTIFICACIONES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- usuarios
-- Perfil extendido del usuario (mismo UUID que auth.users).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme_id              VARCHAR(50), -- INFERIDO, VERIFICAR: default y longitud exactos
    nombre                TEXT,
    apellido              TEXT,
    telefono              TEXT,
    fecha_nacimiento      DATE,
    ultima_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_telefono_formato
        CHECK (telefono IS NULL OR telefono ~ '^\+?[0-9]{8,15}$'),
    ADD CONSTRAINT usuarios_fecha_nacimiento_pasado
        CHECK (fecha_nacimiento IS NULL OR fecha_nacimiento <= CURRENT_DATE),
    ADD CONSTRAINT usuarios_fecha_nacimiento_razonable
        CHECK (fecha_nacimiento IS NULL OR fecha_nacimiento >= '1900-01-01');

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- server/index.js consulta esta tabla con supabaseAdmin (service role) para
-- validar que el user_id del webhook n8n existe — esa query bypassa RLS.
-- Las policies de abajo son para el acceso desde el frontend (anon key).
DROP POLICY IF EXISTS "usuarios_select" ON usuarios; -- INFERIDO, VERIFICAR
CREATE POLICY "usuarios_select" ON usuarios
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "usuarios_insert" ON usuarios; -- INFERIDO, VERIFICAR
CREATE POLICY "usuarios_insert" ON usuarios
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "usuarios_update" ON usuarios; -- INFERIDO, VERIFICAR
CREATE POLICY "usuarios_update" ON usuarios
    FOR UPDATE USING (auth.uid() = id);


-- ----------------------------------------------------------------------------
-- password_reset_codes
-- Códigos de recuperación de contraseña (flujo custom, no resetPasswordForEmail
-- nativo de Supabase). Código de 6 dígitos, expiración de 5 minutos.
-- ----------------------------------------------------------------------------
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
-- Sin policies: deny-all para anon/authenticated. Solo el backend con
-- supabaseAdmin (service role, bypassa RLS) lee/escribe esta tabla.


-- ----------------------------------------------------------------------------
-- notificaciones
-- Notificaciones in-app con soporte de email.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    titulo          TEXT NOT NULL,
    mensaje         TEXT NOT NULL,
    tipo            VARCHAR(20) DEFAULT 'info', -- info | success | warning | error (código usa estos 4 valores)
    leida           BOOLEAN NOT NULL DEFAULT false,
    origen          VARCHAR(30), -- app | gastos | n8n | grupos | sistema (valores vistos en código)
    metadata        JSONB,
    email_enviado   BOOLEAN NOT NULL DEFAULT false,
    email_error     TEXT,
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- server/services/notificacionesDb.js escribe con supabaseAdmin (service role,
-- bypassa RLS) porque las notificaciones de grupos/n8n las genera el backend
-- para OTROS usuarios (no el auth.uid() del request). Las policies de abajo
-- rigen el acceso desde el frontend (anon key) para el propio usuario.
DROP POLICY IF EXISTS "notificaciones_select" ON notificaciones; -- INFERIDO, VERIFICAR
CREATE POLICY "notificaciones_select" ON notificaciones
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notificaciones_insert" ON notificaciones; -- INFERIDO, VERIFICAR
CREATE POLICY "notificaciones_insert" ON notificaciones
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notificaciones_update" ON notificaciones; -- INFERIDO, VERIFICAR
CREATE POLICY "notificaciones_update" ON notificaciones
    FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON notificaciones(user_id, leida);


-- ----------------------------------------------------------------------------
-- configuracion_notificaciones
-- Preferencias de notificaciones por usuario (1 registro por usuario, upsert).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion_notificaciones (
    user_id                             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email_habilitado                    BOOLEAN NOT NULL DEFAULT true, -- INFERIDO, VERIFICAR
    email_notificaciones_n8n            BOOLEAN NOT NULL DEFAULT true, -- INFERIDO, VERIFICAR
    email_saldo_bajo                    BOOLEAN NOT NULL DEFAULT true, -- INFERIDO, VERIFICAR
    email_gasto_alto                    BOOLEAN NOT NULL DEFAULT true, -- INFERIDO, VERIFICAR
    email_resumen_diario                BOOLEAN NOT NULL DEFAULT false, -- INFERIDO, VERIFICAR
    email_resumen_semanal               BOOLEAN NOT NULL DEFAULT false, -- INFERIDO, VERIFICAR
    email_resumen_mensual               BOOLEAN NOT NULL DEFAULT false, -- INFERIDO, VERIFICAR
    email_alertas_gastos_fijos          BOOLEAN NOT NULL DEFAULT true, -- INFERIDO, VERIFICAR
    notificar_saldo_bajo                BOOLEAN NOT NULL DEFAULT true, -- INFERIDO, VERIFICAR
    umbral_saldo_bajo                   NUMERIC(12,2), -- INFERIDO, VERIFICAR
    porcentaje_maximo_ingreso           NUMERIC(5,2), -- INFERIDO, VERIFICAR
    monto_gasto_alto                    NUMERIC(12,2), -- INFERIDO, VERIFICAR
    umbral_fijos_ingreso                NUMERIC(5,2), -- INFERIDO, VERIFICAR
    margen_crecimiento_variables        NUMERIC(5,2), -- INFERIDO, VERIFICAR
    porcentaje_concentracion_categoria  NUMERIC(5,2), -- INFERIDO, VERIFICAR
    objetivo_ahorro_porcentaje          NUMERIC(5,2), -- INFERIDO, VERIFICAR
    fecha_actualizacion                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE configuracion_notificaciones ENABLE ROW LEVEL SECURITY;

-- server/services/notificacionesDb.js lee con supabaseAdmin (service role) para
-- decidir si enviar emails de notificaciones de grupo a OTROS usuarios — esa
-- lectura bypassa RLS. Las policies de abajo rigen el acceso del propio usuario
-- desde el frontend.
DROP POLICY IF EXISTS "configuracion_notificaciones_select" ON configuracion_notificaciones; -- INFERIDO, VERIFICAR
CREATE POLICY "configuracion_notificaciones_select" ON configuracion_notificaciones
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "configuracion_notificaciones_upsert" ON configuracion_notificaciones; -- INFERIDO, VERIFICAR
CREATE POLICY "configuracion_notificaciones_upsert" ON configuracion_notificaciones
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "configuracion_notificaciones_update" ON configuracion_notificaciones; -- INFERIDO, VERIFICAR
CREATE POLICY "configuracion_notificaciones_update" ON configuracion_notificaciones
    FOR UPDATE USING (auth.uid() = user_id);


-- ============================================================================
-- 3. GRUPOS DE GASTOS COMPARTIDOS
-- ============================================================================
-- ADVERTENCIA: no existe migración `.sql` en el repo para este bloque completo
-- (TECHNICAL_DOCS.md menciona 20260507_grupos_gastos_compartidos.sql y
-- 20260509_cuotas_tarjeta_credito.sql, pero ninguna está en server/db/migrations/).
-- Reconstruido desde client/src/lib/db.js, server/routes/grupos.js y
-- TECHNICAL_DOCS.md. Todo lo que no se pudo confirmar por una query real del
-- código está marcado INFERIDO, VERIFICAR.

-- ----------------------------------------------------------------------------
-- grupos_gastos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grupos_gastos (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre               VARCHAR(120) NOT NULL, -- crearGrupo (db.js) valida length <= 120
    descripcion          TEXT,
    creado_por           UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, -- INFERIDO, VERIFICAR: ON DELETE RESTRICT (TECHNICAL_DOCS)
    moneda               VARCHAR(8) NOT NULL DEFAULT 'ARS', -- INFERIDO, VERIFICAR: longitud exacta
    archivado            BOOLEAN NOT NULL DEFAULT false,
    fecha_creacion       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT now() -- actualizado por trigger grupos_set_updated_at()
);

ALTER TABLE grupos_gastos ENABLE ROW LEVEL SECURITY;

-- INFERIDO, VERIFICAR: nombres y condiciones exactas de policies. Se basan en
-- TECHNICAL_DOCS.md + comportamiento observado en db.js/grupos.js
-- (is_group_member/is_group_admin son funciones SECURITY DEFINER para evitar
-- recursión de RLS al hacer JOIN con grupo_miembros).
DROP POLICY IF EXISTS "grupos_gastos_select" ON grupos_gastos;
CREATE POLICY "grupos_gastos_select" ON grupos_gastos
    FOR SELECT USING (is_group_member(id, auth.uid()));

DROP POLICY IF EXISTS "grupos_gastos_insert" ON grupos_gastos;
CREATE POLICY "grupos_gastos_insert" ON grupos_gastos
    FOR INSERT WITH CHECK (creado_por = auth.uid());

DROP POLICY IF EXISTS "grupos_gastos_update" ON grupos_gastos;
CREATE POLICY "grupos_gastos_update" ON grupos_gastos
    FOR UPDATE USING (is_group_admin(id, auth.uid()));

DROP POLICY IF EXISTS "grupos_gastos_delete" ON grupos_gastos;
CREATE POLICY "grupos_gastos_delete" ON grupos_gastos
    FOR DELETE USING (is_group_admin(id, auth.uid()));
-- NOTA: el endpoint DELETE /api/grupos/:grupoId en server/routes/grupos.js
-- usa supabaseAdmin (service role), que bypassa esta policy — la validación de
-- "solo admin puede eliminar" la hace el backend explícitamente (validarAdminGrupo).


-- ----------------------------------------------------------------------------
-- grupo_miembros
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grupo_miembros (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, -- INFERIDO, VERIFICAR: TECHNICAL_DOCS no listaba `id`, pero grupos.js hace .select('id, rol') → existe una PK propia
    grupo_id     BIGINT NOT NULL REFERENCES grupos_gastos(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rol          VARCHAR(20) NOT NULL DEFAULT 'miembro' CHECK (rol IN ('admin', 'miembro')),
    estado       VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'removido')),
    alias        VARCHAR(80), -- nombre alternativo dentro del grupo
    fecha_alta   TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_baja   TIMESTAMPTZ, -- seteado por removerMiembro/salirDelGrupo
    UNIQUE (grupo_id, user_id)
);

ALTER TABLE grupo_miembros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grupo_miembros_select" ON grupo_miembros; -- INFERIDO, VERIFICAR
CREATE POLICY "grupo_miembros_select" ON grupo_miembros
    FOR SELECT USING (user_id = auth.uid() OR is_group_member(grupo_id, auth.uid()));

DROP POLICY IF EXISTS "grupo_miembros_insert" ON grupo_miembros; -- INFERIDO, VERIFICAR
CREATE POLICY "grupo_miembros_insert" ON grupo_miembros
    FOR INSERT WITH CHECK (is_group_admin(grupo_id, auth.uid()));
-- NOTA: la primera fila (creador como admin) la inserta el trigger
-- grupos_alta_admin_creador() (SECURITY DEFINER), que bypassa esta policy.
-- La aceptación de invitaciones la hace la función aceptar_invitacion_grupo()
-- (SECURITY DEFINER, llamada por el backend con service role).

DROP POLICY IF EXISTS "grupo_miembros_update" ON grupo_miembros; -- INFERIDO, VERIFICAR
CREATE POLICY "grupo_miembros_update" ON grupo_miembros
    FOR UPDATE USING (is_group_admin(grupo_id, auth.uid()) OR user_id = auth.uid());
-- user_id = auth.uid() cubre salirDelGrupo() (auto-baja); is_group_admin cubre
-- cambiarRolMiembro() y removerMiembro().

CREATE INDEX IF NOT EXISTS idx_grupo_miembros_user_activo
    ON grupo_miembros(user_id) WHERE estado = 'activo';


-- ----------------------------------------------------------------------------
-- grupo_invitaciones
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grupo_invitaciones (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, -- INFERIDO, VERIFICAR: grupos.js selecciona `id`, tipo asumido BIGINT como el resto
    token              UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(), -- generado por DEFAULT en SQL (comentario en grupos.js)
    grupo_id           BIGINT NOT NULL REFERENCES grupos_gastos(id) ON DELETE CASCADE,
    email_invitado     VARCHAR(255) NOT NULL,
    invitado_por       UUID NOT NULL REFERENCES auth.users(id),
    estado             VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'expirada', 'cancelada')),
    fecha_expiracion   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    fecha_resolucion   TIMESTAMPTZ, -- seteado al expirar/cancelar/aceptar
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now() -- usado para rate limiting (superaRateLimit en grupos.js)
);

ALTER TABLE grupo_invitaciones ENABLE ROW LEVEL SECURITY;

-- NOTA: la mayoría de las operaciones sobre esta tabla (creación, aceptación,
-- búsqueda de rate limit) las hace el backend con supabaseAdmin (service role),
-- que bypassa RLS. Las policies de abajo cubren las lecturas directas desde
-- el frontend (obtenerInvitacionesPendientes, obtenerInvitacionesParaMi,
-- cancelarInvitacion en db.js).
DROP POLICY IF EXISTS "grupo_invitaciones_select" ON grupo_invitaciones; -- INFERIDO, VERIFICAR
CREATE POLICY "grupo_invitaciones_select" ON grupo_invitaciones
    FOR SELECT USING (
        is_group_admin(grupo_id, auth.uid())
        OR email_invitado = (auth.jwt() ->> 'email')
    );

DROP POLICY IF EXISTS "grupo_invitaciones_update" ON grupo_invitaciones; -- INFERIDO, VERIFICAR
CREATE POLICY "grupo_invitaciones_update" ON grupo_invitaciones
    FOR UPDATE USING (
        is_group_admin(grupo_id, auth.uid())
        OR email_invitado = (auth.jwt() ->> 'email')
    );


-- ----------------------------------------------------------------------------
-- grupo_gastos
-- Gastos dentro de un grupo. Soporta cuotas de tarjeta (20260515_cuotas_grupales.sql)
-- y método de pago propio (20260718_id_metodo_pago_grupo_gastos.sql).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grupo_gastos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    grupo_id        BIGINT NOT NULL REFERENCES grupos_gastos(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL, -- se guarda en MAYÚSCULAS (regla de negocio en grupos.js)
    monto           NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    pagado_por      UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    fecha           TIMESTAMPTZ NOT NULL,
    nota            TEXT,
    id_categoria    BIGINT REFERENCES categorias(id),
    estado          VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
    creado_por      UUID NOT NULL REFERENCES auth.users(id), -- INFERIDO, VERIFICAR: ON DELETE de esta FK
    -- Columnas de cuotas — agregadas en 20260515_cuotas_grupales.sql:
    cuotas          SMALLINT NOT NULL DEFAULT 1 CHECK (cuotas BETWEEN 1 AND 18),
    numero_cuota    SMALLINT NOT NULL DEFAULT 1 CHECK (numero_cuota >= 1),
    id_gasto_padre  BIGINT REFERENCES grupo_gastos(id) ON DELETE CASCADE,
    metodo_pago     VARCHAR(60), -- columna legacy (string libre, ej. 'TARJETA DE CREDITO'); reemplazada en la práctica por id_metodo_pago
    -- Columna nueva — agregada en 20260718_id_metodo_pago_grupo_gastos.sql:
    id_metodo_pago  BIGINT REFERENCES metodos_pago(id),
    -- Columnas de anulación (soft delete) — usadas en grupos.js pero sin migración propia:
    anulado_en      TIMESTAMPTZ, -- INFERIDO, VERIFICAR
    anulado_por     UUID REFERENCES auth.users(id) -- INFERIDO, VERIFICAR
);

ALTER TABLE grupo_gastos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grupo_gastos_select" ON grupo_gastos; -- INFERIDO, VERIFICAR
CREATE POLICY "grupo_gastos_select" ON grupo_gastos
    FOR SELECT USING (is_group_member(grupo_id, auth.uid()));

DROP POLICY IF EXISTS "grupo_gastos_insert" ON grupo_gastos; -- INFERIDO, VERIFICAR
CREATE POLICY "grupo_gastos_insert" ON grupo_gastos
    FOR INSERT WITH CHECK (is_group_member(grupo_id, auth.uid()) AND creado_por = auth.uid());

-- NOTA IMPORTANTE: el código real (server/routes/grupos.js, endpoints PUT/PATCH
-- de edición y anulación) valida "solo quien pagó (`pagado_por`) puede editar o
-- anular" — NO "creado_por o admin" como sugiere TECHNICAL_DOCS.md. Esas
-- operaciones además corren con supabaseAdmin (service role), que bypassa RLS;
-- la regla de autorización real vive en la capa de aplicación (grupos.js),
-- no en esta policy. Se deja una policy conservadora de UPDATE por si el
-- frontend llega a escribir directo con anon key — VERIFICAR contra Supabase real.
DROP POLICY IF EXISTS "grupo_gastos_update" ON grupo_gastos; -- INFERIDO, VERIFICAR
CREATE POLICY "grupo_gastos_update" ON grupo_gastos
    FOR UPDATE USING (creado_por = auth.uid() OR is_group_admin(grupo_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_grupo_gastos_activos      ON grupo_gastos(grupo_id) WHERE estado = 'activo';
CREATE INDEX IF NOT EXISTS idx_grupo_gastos_gasto_padre  ON grupo_gastos(id_gasto_padre) WHERE id_gasto_padre IS NOT NULL;


-- ----------------------------------------------------------------------------
-- grupo_gasto_participantes
-- División del gasto grupal entre participantes.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grupo_gasto_participantes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, -- INFERIDO, VERIFICAR: db.js selecciona `id`, así que existe PK propia
    gasto_id        BIGINT NOT NULL REFERENCES grupo_gastos(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    monto_asignado  NUMERIC(12,2) NOT NULL CHECK (monto_asignado >= 0),
    porcentaje      NUMERIC(5,2), -- INFERIDO, VERIFICAR: db.js selecciona esta columna pero ningún insert la puebla explícitamente en el código leído
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (gasto_id, user_id)
);

ALTER TABLE grupo_gasto_participantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grupo_gasto_participantes_select" ON grupo_gasto_participantes; -- INFERIDO, VERIFICAR
CREATE POLICY "grupo_gasto_participantes_select" ON grupo_gasto_participantes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM grupo_gastos gg
            WHERE gg.id = gasto_id AND is_group_member(gg.grupo_id, auth.uid())
        )
    );
-- NOTA: los INSERT/DELETE de esta tabla los hace exclusivamente el backend con
-- supabaseAdmin (service role) al crear/editar gastos grupales (grupos.js) —
-- no hay policies de INSERT/UPDATE/DELETE confirmadas para anon key.


-- ----------------------------------------------------------------------------
-- grupo_liquidaciones
-- Pagos reales entre miembros para saldar deudas.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grupo_liquidaciones (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id         BIGINT NOT NULL REFERENCES grupos_gastos(id) ON DELETE CASCADE,
    de_user_id       UUID NOT NULL REFERENCES auth.users(id),
    para_user_id     UUID NOT NULL REFERENCES auth.users(id),
    monto            NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    fecha            DATE NOT NULL,
    nota             TEXT,
    estado           VARCHAR(20) NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada', 'anulada')),
    registrado_por   UUID NOT NULL REFERENCES auth.users(id),
    anulada_en       TIMESTAMPTZ,
    CHECK (de_user_id <> para_user_id)
);

ALTER TABLE grupo_liquidaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grupo_liquidaciones_select" ON grupo_liquidaciones; -- INFERIDO, VERIFICAR
CREATE POLICY "grupo_liquidaciones_select" ON grupo_liquidaciones
    FOR SELECT USING (is_group_member(grupo_id, auth.uid()));
-- NOTA: INSERT/UPDATE los hace el backend con supabaseAdmin — la regla real
-- ("solo quien registró o admin puede anular") vive en grupos.js, no en RLS.


-- ----------------------------------------------------------------------------
-- vw_grupo_saldos
-- Vista de saldos netos por miembro. Rediseñada en 20260515_cuotas_grupales.sql
-- para excluir cuotas futuras del saldo actual.
-- saldo_neto > 0: te deben | saldo_neto < 0: debés
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_grupo_saldos AS
WITH gastos_vigentes AS (
    SELECT id, grupo_id, pagado_por, monto, estado
    FROM grupo_gastos
    WHERE estado = 'activo'
      AND (
          cuotas = 1
          OR (cuotas > 1 AND fecha::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
      )
),
pagos AS (
    SELECT g.grupo_id, g.pagado_por AS user_id, SUM(g.monto) AS total_pagado
    FROM gastos_vigentes g
    GROUP BY g.grupo_id, g.pagado_por
),
asignaciones AS (
    SELECT g.grupo_id, p.user_id, SUM(p.monto_asignado) AS total_asignado
    FROM grupo_gasto_participantes p
    JOIN gastos_vigentes g ON g.id = p.gasto_id
    GROUP BY g.grupo_id, p.user_id
),
liquidaciones_enviadas AS (
    SELECT grupo_id, de_user_id AS user_id, SUM(monto) AS total_enviado
    FROM grupo_liquidaciones
    WHERE estado = 'confirmada'
    GROUP BY grupo_id, de_user_id
),
liquidaciones_recibidas AS (
    SELECT grupo_id, para_user_id AS user_id, SUM(monto) AS total_recibido
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
    COALESCE(pa.total_pagado,   0) AS pagado,
    COALESCE(a.total_asignado,  0) AS asignado,
    COALESCE(le.total_enviado,  0) AS liquidado_enviado,
    COALESCE(lr.total_recibido, 0) AS liquidado_recibido,
    COALESCE(pa.total_pagado,   0)
    + COALESCE(le.total_enviado,  0)
    - COALESCE(a.total_asignado,  0)
    - COALESCE(lr.total_recibido, 0) AS saldo_neto
FROM miembros_activos m
LEFT JOIN pagos                   pa ON pa.grupo_id = m.grupo_id AND pa.user_id = m.user_id
LEFT JOIN asignaciones             a ON  a.grupo_id = m.grupo_id AND  a.user_id = m.user_id
LEFT JOIN liquidaciones_enviadas  le ON le.grupo_id = m.grupo_id AND le.user_id = m.user_id
LEFT JOIN liquidaciones_recibidas lr ON lr.grupo_id = m.grupo_id AND lr.user_id = m.user_id;


-- ============================================================================
-- 4. FUNCIONES Y TRIGGERS (grupos de gastos)
-- ============================================================================
-- INFERIDO, VERIFICAR: no hay migración `.sql` en el repo para estas funciones.
-- Firmas reconstruidas desde el uso real en client/src/lib/db.js y
-- server/routes/grupos.js (nombres de parámetros RPC confirmados por código:
-- p_nombre, p_descripcion, p_moneda, p_token, p_user_id). El CUERPO de cada
-- función es una reconstrucción razonable del comportamiento observado, no una
-- copia del SQL real — Nicolás debe confirmar contra pg_proc en Supabase.

-- is_group_member: true si el usuario es miembro activo del grupo.
-- SECURITY DEFINER para evitar recursión de RLS al usarse dentro de policies
-- de grupos_gastos/grupo_gastos que a su vez consultan grupo_miembros.
CREATE OR REPLACE FUNCTION is_group_member(p_grupo_id BIGINT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM grupo_miembros
        WHERE grupo_id = p_grupo_id AND user_id = p_user_id AND estado = 'activo'
    );
$$;

-- is_group_admin: true si el usuario es admin activo del grupo.
CREATE OR REPLACE FUNCTION is_group_admin(p_grupo_id BIGINT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM grupo_miembros
        WHERE grupo_id = p_grupo_id AND user_id = p_user_id AND estado = 'activo' AND rol = 'admin'
    );
$$;

-- is_group_creator: true si el usuario creó el grupo. -- INFERIDO, VERIFICAR: no se vio uso directo en el código leído
CREATE OR REPLACE FUNCTION is_group_creator(p_grupo_id BIGINT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM grupos_gastos
        WHERE id = p_grupo_id AND creado_por = p_user_id
    );
$$;

-- crear_grupo_gasto_compartido: crea un grupo usando auth.uid() del llamador.
-- Llamada desde crearGrupo() en db.js vía supabase.rpc(). Retorna el ID creado.
CREATE OR REPLACE FUNCTION crear_grupo_gasto_compartido(p_nombre VARCHAR, p_descripcion TEXT, p_moneda VARCHAR)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_grupo_id BIGINT;
BEGIN
    INSERT INTO grupos_gastos (nombre, descripcion, moneda, creado_por)
    VALUES (p_nombre, p_descripcion, COALESCE(p_moneda, 'ARS'), auth.uid())
    RETURNING id INTO v_grupo_id;

    RETURN v_grupo_id;
END;
$$;

-- aceptar_invitacion_grupo: transacción atómica — marca invitación aceptada
-- + inserta miembro activo. Llamada desde POST /api/grupos/invitaciones/aceptar
-- (server/routes/grupos.js) con service role.
CREATE OR REPLACE FUNCTION aceptar_invitacion_grupo(p_token UUID, p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_grupo_id BIGINT;
BEGIN
    SELECT grupo_id INTO v_grupo_id
    FROM grupo_invitaciones
    WHERE token = p_token AND estado = 'pendiente'
    FOR UPDATE;

    IF v_grupo_id IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE grupo_invitaciones
    SET estado = 'aceptada', fecha_resolucion = now()
    WHERE token = p_token;

    INSERT INTO grupo_miembros (grupo_id, user_id, rol, estado)
    VALUES (v_grupo_id, p_user_id, 'miembro', 'activo')
    ON CONFLICT (grupo_id, user_id) DO UPDATE
        SET estado = 'activo', fecha_baja = NULL;

    RETURN v_grupo_id;
END;
$$;

-- grupos_set_updated_at: actualiza fecha_actualizacion en cada UPDATE de grupos_gastos.
CREATE OR REPLACE FUNCTION grupos_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.fecha_actualizacion = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grupos_set_updated_at ON grupos_gastos; -- INFERIDO, VERIFICAR: nombre real del trigger
CREATE TRIGGER trg_grupos_set_updated_at
    BEFORE UPDATE ON grupos_gastos
    FOR EACH ROW
    EXECUTE FUNCTION grupos_set_updated_at();

-- grupos_alta_admin_creador: al crear un grupo, agrega automáticamente al
-- creador como admin activo.
CREATE OR REPLACE FUNCTION grupos_alta_admin_creador()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO grupo_miembros (grupo_id, user_id, rol, estado)
    VALUES (NEW.id, NEW.creado_por, 'admin', 'activo')
    ON CONFLICT (grupo_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grupos_alta_admin_creador ON grupos_gastos; -- INFERIDO, VERIFICAR: nombre real del trigger
CREATE TRIGGER trg_grupos_alta_admin_creador
    AFTER INSERT ON grupos_gastos
    FOR EACH ROW
    EXECUTE FUNCTION grupos_alta_admin_creador();

-- ============================================================================
-- 5. FUNCIONES (gastos personales en cuotas)
-- ============================================================================
-- Agregada en migrations/20260720_rpc_create_expense_installments.sql.
-- create_expense_installments: crea un gasto en cuotas (tarjeta/préstamo) de
-- forma atómica — reemplaza el flujo de 3 pasos con rollback manual en
-- client/src/lib/db.js (createExpense), que podía dejar cuotas huérfanas si el
-- proceso perdía conexión a mitad de camino. SECURITY INVOKER: respeta las
-- políticas RLS de gastos (gastos_insert: auth.uid() = user_id), no es un bypass.

CREATE OR REPLACE FUNCTION create_expense_installments(
    p_descripcion      TEXT,
    p_monto_total      NUMERIC(12,2),
    p_cuotas           SMALLINT,
    p_fecha_primera_cuota TEXT,
    p_id_categoria     BIGINT DEFAULT NULL,
    p_id_metodo_pago   BIGINT DEFAULT NULL
)
RETURNS SETOF gastos
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_user_id         UUID := auth.uid();
    v_cuotas          SMALLINT := GREATEST(1, LEAST(120, p_cuotas));
    v_monto_por_cuota NUMERIC(12,2) := FLOOR((p_monto_total / v_cuotas) * 100) / 100;
    v_diferencia      NUMERIC(12,2) := ROUND(p_monto_total - v_monto_por_cuota * v_cuotas, 2);
    v_fecha_primera   DATE;
    v_id_padre        BIGINT;
    v_fecha_cuota     DATE;
    v_monto_cuota     NUMERIC(12,2);
    v_descripcion_cuota TEXT;
    i                 SMALLINT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No hay sesión de usuario activa';
    END IF;

    IF p_monto_total IS NULL OR p_monto_total <= 0 THEN
        RAISE EXCEPTION 'El monto debe ser mayor a cero';
    END IF;

    IF p_fecha_primera_cuota IS NULL OR btrim(p_fecha_primera_cuota) = '' THEN
        RAISE EXCEPTION 'Indicá en qué mes vence la primera cuota';
    END IF;

    -- p_fecha_primera_cuota llega como TEXT (no DATE) porque el front lo manda en
    -- formato YYYY-MM (mes sin día) — igual que hacía calcularCuotas() en JS antes
    -- del RPC. Si fuera DATE, PostgREST intentaría castear "2026-08" directo y
    -- fallaría con "invalid input syntax for type date" antes de llegar a este código.
    -- Se acepta YYYY-MM o YYYY-MM-DD y siempre se normaliza al día 1 del mes.
    IF p_fecha_primera_cuota !~ '^\d{4}-\d{2}(-\d{2})?$' THEN
        RAISE EXCEPTION 'Formato de fecha inválido, se espera YYYY-MM';
    END IF;
    v_fecha_primera := to_date(left(p_fecha_primera_cuota, 7) || '-01', 'YYYY-MM-DD');

    v_descripcion_cuota := CASE WHEN v_cuotas > 1
        THEN p_descripcion || ' (1/' || v_cuotas || ')'
        ELSE p_descripcion
    END;
    v_monto_cuota := ROUND(v_monto_por_cuota + v_diferencia, 2);

    INSERT INTO gastos (
        user_id, descripcion, monto, id_categoria, id_metodo_pago,
        fecha, es_fijo, cuotas, numero_cuota, id_gasto_padre
    ) VALUES (
        v_user_id, v_descripcion_cuota, v_monto_cuota, p_id_categoria, p_id_metodo_pago,
        v_fecha_primera, true, v_cuotas, 1, NULL
    ) RETURNING id INTO v_id_padre;

    UPDATE gastos SET id_gasto_padre = v_id_padre WHERE id = v_id_padre;

    FOR i IN 2..v_cuotas LOOP
        v_fecha_cuota := v_fecha_primera + ((i - 1) * INTERVAL '1 month');
        v_descripcion_cuota := p_descripcion || ' (' || i || '/' || v_cuotas || ')';

        INSERT INTO gastos (
            user_id, descripcion, monto, id_categoria, id_metodo_pago,
            fecha, es_fijo, cuotas, numero_cuota, id_gasto_padre
        ) VALUES (
            v_user_id, v_descripcion_cuota, v_monto_por_cuota, p_id_categoria, p_id_metodo_pago,
            v_fecha_cuota, true, v_cuotas, i, v_id_padre
        );
    END LOOP;

    RETURN QUERY SELECT * FROM gastos WHERE id_gasto_padre = v_id_padre ORDER BY numero_cuota;
END;
$$;

-- ============================================================================
-- 6. FUNCIONES (gastos grupales en cuotas)
-- ============================================================================
-- Agregada en migrations/20260721_rpc_create_grupo_gasto_installments.sql.
-- create_grupo_gasto_installments: crea un gasto GRUPAL en cuotas de forma
-- atomica (mismo problema que create_expense_installments pero con 3 pasos:
-- cuota 1 -> cuotas 2..N -> participantes de cada cuota). SECURITY DEFINER
-- porque lo llama el backend (supabaseAdmin) despues de validar membresia,
-- pagador y metodo de pago en server/routes/grupos.js — no repite esas
-- validaciones, confia en el caller server-side (igual que aceptar_invitacion_grupo).

CREATE OR REPLACE FUNCTION create_grupo_gasto_installments(
    p_grupo_id         BIGINT,
    p_descripcion      TEXT,
    p_monto_total      NUMERIC(12,2),
    p_cuotas           SMALLINT,
    p_fecha_primera_cuota TEXT,
    p_pagado_por       UUID,
    p_creado_por       UUID,
    p_participantes    UUID[],
    p_id_categoria     BIGINT DEFAULT NULL,
    p_id_metodo_pago   BIGINT DEFAULT NULL,
    p_nota             TEXT DEFAULT NULL
)
RETURNS SETOF grupo_gastos
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cuotas          SMALLINT := GREATEST(1, LEAST(18, p_cuotas));
    v_monto_por_cuota NUMERIC(12,2) := FLOOR((p_monto_total / v_cuotas) * 100) / 100;
    v_diferencia      NUMERIC(12,2) := ROUND(p_monto_total - v_monto_por_cuota * v_cuotas, 2);
    v_fecha_primera   DATE;
    v_id_padre        BIGINT;
    v_fecha_cuota     DATE;
    v_monto_cuota     NUMERIC(12,2);
    v_descripcion_cuota TEXT;
    v_gasto_id        BIGINT;
    v_participante    UUID;
    v_n_participantes INT := COALESCE(array_length(p_participantes, 1), 0);
    v_base_part       NUMERIC(12,2);
    v_diferencia_part NUMERIC(12,2);
    v_idx_pagador     INT;
    i                 SMALLINT;
    j                 INT;
BEGIN
    IF p_monto_total IS NULL OR p_monto_total <= 0 THEN
        RAISE EXCEPTION 'El monto debe ser mayor a cero';
    END IF;

    IF v_n_participantes < 1 THEN
        RAISE EXCEPTION 'Se requiere al menos un participante';
    END IF;

    IF p_fecha_primera_cuota IS NULL OR p_fecha_primera_cuota !~ '^\d{4}-\d{2}(-\d{2})?$' THEN
        RAISE EXCEPTION 'Formato de fecha inválido, se espera YYYY-MM';
    END IF;
    v_fecha_primera := to_date(left(p_fecha_primera_cuota, 7) || '-01', 'YYYY-MM-DD');

    v_idx_pagador := COALESCE(array_position(p_participantes, p_pagado_por), 1);

    v_descripcion_cuota := p_descripcion || ' (1/' || v_cuotas || ')';
    v_monto_cuota := ROUND(v_monto_por_cuota + v_diferencia, 2);

    INSERT INTO grupo_gastos (
        grupo_id, descripcion, monto, pagado_por, fecha, nota, id_categoria,
        creado_por, cuotas, numero_cuota, id_gasto_padre, id_metodo_pago
    ) VALUES (
        p_grupo_id, v_descripcion_cuota, v_monto_cuota, p_pagado_por, v_fecha_primera, p_nota, p_id_categoria,
        p_creado_por, v_cuotas, 1, NULL, p_id_metodo_pago
    ) RETURNING id INTO v_id_padre;

    UPDATE grupo_gastos SET id_gasto_padre = v_id_padre WHERE id = v_id_padre;

    v_base_part := FLOOR((v_monto_cuota / v_n_participantes) * 100) / 100;
    v_diferencia_part := ROUND(v_monto_cuota - v_base_part * v_n_participantes, 2);
    FOR j IN 1..v_n_participantes LOOP
        v_participante := p_participantes[j];
        INSERT INTO grupo_gasto_participantes (gasto_id, user_id, monto_asignado)
        VALUES (
            v_id_padre, v_participante,
            CASE WHEN j = v_idx_pagador THEN ROUND(v_base_part + v_diferencia_part, 2) ELSE v_base_part END
        );
    END LOOP;

    FOR i IN 2..v_cuotas LOOP
        v_fecha_cuota := v_fecha_primera + ((i - 1) * INTERVAL '1 month');
        v_descripcion_cuota := p_descripcion || ' (' || i || '/' || v_cuotas || ')';

        INSERT INTO grupo_gastos (
            grupo_id, descripcion, monto, pagado_por, fecha, nota, id_categoria,
            creado_por, cuotas, numero_cuota, id_gasto_padre, id_metodo_pago
        ) VALUES (
            p_grupo_id, v_descripcion_cuota, v_monto_por_cuota, p_pagado_por, v_fecha_cuota, p_nota, p_id_categoria,
            p_creado_por, v_cuotas, i, v_id_padre, p_id_metodo_pago
        ) RETURNING id INTO v_gasto_id;

        v_base_part := FLOOR((v_monto_por_cuota / v_n_participantes) * 100) / 100;
        v_diferencia_part := ROUND(v_monto_por_cuota - v_base_part * v_n_participantes, 2);
        FOR j IN 1..v_n_participantes LOOP
            v_participante := p_participantes[j];
            INSERT INTO grupo_gasto_participantes (gasto_id, user_id, monto_asignado)
            VALUES (
                v_gasto_id, v_participante,
                CASE WHEN j = v_idx_pagador THEN ROUND(v_base_part + v_diferencia_part, 2) ELSE v_base_part END
            );
        END LOOP;
    END LOOP;

    RETURN QUERY SELECT * FROM grupo_gastos WHERE id_gasto_padre = v_id_padre ORDER BY numero_cuota;
END;
$$;

-- ============================================================================
-- 7. FUNCIONES (edición de gastos grupales en cuotas)
-- ============================================================================
-- Agregada en migrations/20260722_rpc_update_grupo_gasto_installments.sql.
-- update_grupo_gasto_installments: edita un gasto grupal (con o sin cuotas) de
-- forma atomica. p_monto es el TOTAL de la compra (no el monto de una cuota
-- puntual) y p_cuotas la cantidad deseada — si el gasto tiene cuotas, recrea
-- todas las cuotas hijas con los nuevos montos/fechas, conservando el id de
-- la fila editada como id_gasto_padre.

CREATE OR REPLACE FUNCTION update_grupo_gasto_installments(
    p_gasto_id         BIGINT,
    p_descripcion      TEXT,
    p_monto            NUMERIC(12,2),
    p_pagado_por       UUID,
    p_fecha            TEXT,
    p_participantes    UUID[],
    p_id_categoria     BIGINT DEFAULT NULL,
    p_id_metodo_pago   BIGINT DEFAULT NULL,
    p_nota             TEXT DEFAULT NULL,
    p_primera_cuota    TEXT DEFAULT NULL,
    p_cuotas           SMALLINT DEFAULT NULL
)
RETURNS grupo_gastos
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_gasto           grupo_gastos;
    v_gasto_padre_id  BIGINT;
    v_fecha_gasto     TIMESTAMPTZ;
    v_fecha_primera   DATE;
    v_cuotas          SMALLINT;
    v_monto_por_cuota NUMERIC(12,2);
    v_diferencia      NUMERIC(12,2);
    v_monto_cuota     NUMERIC(12,2);
    v_fecha_cuota     DATE;
    v_descripcion_cuota TEXT;
    v_gasto_id        BIGINT;
    v_n_participantes INT := COALESCE(array_length(p_participantes, 1), 0);
    v_base_part       NUMERIC(12,2);
    v_diferencia_part NUMERIC(12,2);
    v_idx_pagador     INT;
    v_participante    UUID;
    i                 SMALLINT;
    j                 INT;
BEGIN
    IF p_monto IS NULL OR p_monto <= 0 THEN
        RAISE EXCEPTION 'El monto debe ser mayor a cero';
    END IF;

    IF v_n_participantes < 1 THEN
        RAISE EXCEPTION 'Se requiere al menos un participante';
    END IF;

    SELECT id_gasto_padre INTO v_gasto_padre_id FROM grupo_gastos
    WHERE id = p_gasto_id AND estado = 'activo';

    IF v_gasto_padre_id IS NULL THEN
        RAISE EXCEPTION 'El gasto no existe o ya fue anulado';
    END IF;

    v_cuotas := GREATEST(1, LEAST(18, COALESCE(p_cuotas, 1)));

    IF p_fecha IS NOT NULL AND btrim(p_fecha) != '' THEN
        v_fecha_gasto := (p_fecha || 'T12:00:00-03:00')::TIMESTAMPTZ;
    ELSE
        v_fecha_gasto := ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE::TEXT || 'T12:00:00-03:00')::TIMESTAMPTZ;
    END IF;

    IF v_cuotas <= 1 THEN
        UPDATE grupo_gastos SET
            descripcion    = p_descripcion,
            monto          = p_monto,
            pagado_por     = p_pagado_por,
            fecha          = v_fecha_gasto,
            nota           = p_nota,
            id_categoria   = p_id_categoria,
            id_metodo_pago = p_id_metodo_pago
        WHERE id = p_gasto_id AND estado = 'activo'
        RETURNING * INTO v_gasto;
    ELSE
        IF p_primera_cuota IS NULL OR p_primera_cuota !~ '^\d{4}-\d{2}(-\d{2})?$' THEN
            RAISE EXCEPTION 'Formato de fecha inválido, se espera YYYY-MM';
        END IF;
        v_fecha_primera := to_date(left(p_primera_cuota, 7) || '-01', 'YYYY-MM-DD');

        v_monto_por_cuota := FLOOR((p_monto / v_cuotas) * 100) / 100;
        v_diferencia := ROUND(p_monto - v_monto_por_cuota * v_cuotas, 2);
        v_monto_cuota := ROUND(v_monto_por_cuota + v_diferencia, 2);
        v_descripcion_cuota := CASE WHEN v_cuotas > 1
            THEN p_descripcion || ' (1/' || v_cuotas || ')'
            ELSE p_descripcion
        END;

        UPDATE grupo_gastos SET
            descripcion    = v_descripcion_cuota,
            monto          = v_monto_cuota,
            pagado_por     = p_pagado_por,
            fecha          = v_fecha_primera,
            nota           = p_nota,
            id_categoria   = p_id_categoria,
            id_metodo_pago = p_id_metodo_pago,
            cuotas         = v_cuotas,
            numero_cuota   = 1,
            id_gasto_padre = p_gasto_id
        WHERE id = p_gasto_id AND estado = 'activo'
        RETURNING * INTO v_gasto;

        DELETE FROM grupo_gastos WHERE id_gasto_padre = p_gasto_id AND id != p_gasto_id;

        FOR i IN 2..v_cuotas LOOP
            v_fecha_cuota := v_fecha_primera + ((i - 1) * INTERVAL '1 month');
            v_descripcion_cuota := p_descripcion || ' (' || i || '/' || v_cuotas || ')';

            INSERT INTO grupo_gastos (
                grupo_id, descripcion, monto, pagado_por, fecha, nota, id_categoria,
                creado_por, cuotas, numero_cuota, id_gasto_padre, id_metodo_pago
            ) VALUES (
                v_gasto.grupo_id, v_descripcion_cuota, v_monto_por_cuota, p_pagado_por, v_fecha_cuota, p_nota, p_id_categoria,
                v_gasto.creado_por, v_cuotas, i, p_gasto_id, p_id_metodo_pago
            );
        END LOOP;
    END IF;

    IF v_gasto IS NULL THEN
        RAISE EXCEPTION 'El gasto no existe o ya fue anulado';
    END IF;

    DELETE FROM grupo_gasto_participantes WHERE gasto_id = p_gasto_id;

    v_idx_pagador := COALESCE(array_position(p_participantes, p_pagado_por), 1);
    v_base_part := FLOOR((v_gasto.monto / v_n_participantes) * 100) / 100;
    v_diferencia_part := ROUND(v_gasto.monto - v_base_part * v_n_participantes, 2);

    FOR j IN 1..v_n_participantes LOOP
        v_participante := p_participantes[j];
        INSERT INTO grupo_gasto_participantes (gasto_id, user_id, monto_asignado)
        VALUES (
            p_gasto_id, v_participante,
            CASE WHEN j = v_idx_pagador THEN ROUND(v_base_part + v_diferencia_part, 2) ELSE v_base_part END
        );
    END LOOP;

    IF v_cuotas > 1 THEN
        FOR v_gasto_id IN
            SELECT id FROM grupo_gastos WHERE id_gasto_padre = p_gasto_id AND id != p_gasto_id
        LOOP
            v_base_part := FLOOR((v_monto_por_cuota / v_n_participantes) * 100) / 100;
            v_diferencia_part := ROUND(v_monto_por_cuota - v_base_part * v_n_participantes, 2);
            FOR j IN 1..v_n_participantes LOOP
                v_participante := p_participantes[j];
                INSERT INTO grupo_gasto_participantes (gasto_id, user_id, monto_asignado)
                VALUES (
                    v_gasto_id, v_participante,
                    CASE WHEN j = v_idx_pagador THEN ROUND(v_base_part + v_diferencia_part, 2) ELSE v_base_part END
                );
            END LOOP;
        END LOOP;
    END IF;

    RETURN v_gasto;
END;
$$;


-- ============================================================================
-- NOTA DE ORDEN DE EJECUCIÓN
-- ============================================================================
-- Este archivo referencia ingresos_recurrentes (FK) antes de definirla, porque
-- se documentó siguiendo el mismo orden que TECHNICAL_DOCS.md. Para ejecutar
-- este script de punta a punta en una DB nueva, mover el bloque
-- "ingresos_recurrentes" (abajo) ANTES del CREATE TABLE ingresos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ingresos_recurrentes
-- Plantillas de ingresos que se esperan mensualmente.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingresos_recurrentes (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    descripcion          TEXT NOT NULL, -- se guarda en MAYÚSCULAS
    monto                NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    frecuencia           VARCHAR(20) NOT NULL DEFAULT 'mensual', -- único valor visto en código
    activo               BOOLEAN NOT NULL DEFAULT true,
    dia_estimado         SMALLINT CHECK (dia_estimado BETWEEN 1 AND 31),
    categoria_id         BIGINT REFERENCES categorias_ingresos(id),
    fecha_inicio         DATE NOT NULL,
    fecha_fin            DATE,
    fecha_creacion       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ingresos_recurrentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ingresos_recurrentes_select" ON ingresos_recurrentes; -- INFERIDO, VERIFICAR
CREATE POLICY "ingresos_recurrentes_select" ON ingresos_recurrentes
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ingresos_recurrentes_insert" ON ingresos_recurrentes; -- INFERIDO, VERIFICAR
CREATE POLICY "ingresos_recurrentes_insert" ON ingresos_recurrentes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ingresos_recurrentes_update" ON ingresos_recurrentes; -- INFERIDO, VERIFICAR
CREATE POLICY "ingresos_recurrentes_update" ON ingresos_recurrentes
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ingresos_recurrentes_delete" ON ingresos_recurrentes; -- INFERIDO, VERIFICAR
CREATE POLICY "ingresos_recurrentes_delete" ON ingresos_recurrentes
    FOR DELETE USING (auth.uid() = user_id);
