# Documentación Técnico-Funcional — TusGastosApp

> Generado automáticamente el 2026-05-09. Refleja el estado actual del código fuente.

---

## 1. Resumen del Proyecto

**TusGastosApp** es una aplicación web de finanzas personales que permite registrar, clasificar y analizar gastos mensuales. Está orientada a usuarios individuales que quieran llevar un control detallado de su dinero, con soporte para gastos fijos y variables, tarjeta de crédito en cuotas, grupos de gastos compartidos con otras personas, alertas financieras y registro automático de gastos desde WhatsApp vía n8n.

### Stack tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Frontend** | React 19, Vite, JavaScript (sin TypeScript), React Router DOM, Supabase JS, Lucide React, Material Symbols, CSS puro |
| **Backend** | Node.js, Express, CommonJS, Supabase JS (service role), dotenv, cors, crypto, nodemon, nodemailer |
| **Base de datos** | Supabase PostgreSQL con RLS obligatorio en todas las tablas |
| **Autenticación** | Supabase Auth — Google OAuth 2.0 |
| **Integraciones** | n8n (registro de gastos desde WhatsApp), Email SMTP (notificaciones) |
| **Dev tooling** | concurrently (cliente + servidor en paralelo) |

### Diagrama de arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                         BROWSER                                  │
│  React 19 SPA (Vite, CSS puro, Glassmorphism)                   │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────────────┐   │
│  │Dashboard │  │Movements │  │ Grupos / Reportes / Config  │   │
│  └────┬─────┘  └────┬─────┘  └──────────────┬──────────────┘   │
│       │              │                        │                  │
│       └──────────────┴────────────────────────┘                 │
│                    client/src/lib/db.js  (DAL)                  │
│                    Supabase JS (anon key)                        │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
          ┌──────────────┴──────────────┐
          │                             │
 ┌────────▼─────────┐        ┌─────────▼───────────────┐
 │  Supabase BaaS   │        │  Express Server :3001    │
 │  PostgreSQL + RLS│        │  Node.js + CommonJS      │
 │  Auth (Google)   │        │  server/index.js         │
 │  Storage         │        │  server/routes/          │
 └──────────────────┘        │  server/services/        │
                             └─────────────────────────┘
                                         ▲
                                         │ x-api-key
                              ┌──────────┴──────────┐
                              │    n8n / WhatsApp    │
                              └─────────────────────┘
```

---

## 2. Arquitectura

### Patrón arquitectónico

La aplicación sigue el patrón **SPA + API REST + BaaS**:

- El **frontend** es una Single Page Application que se comunica directamente con Supabase para operaciones de lectura/escritura de datos propios del usuario (gracias a RLS, cada usuario solo ve sus datos).
- El **backend Express** actúa como servidor de integraciones: recibe llamadas de n8n/WhatsApp, valida la API key, y escribe en Supabase usando la service role key. También gestiona operaciones que requieren privilegios elevados (búsqueda de usuarios por email, aceptación de invitaciones a grupos, envío de emails).
- **Supabase** funciona como BaaS: provee la base de datos PostgreSQL con RLS, el sistema de autenticación con Google, y el cliente JS para el frontend.

### Capas del sistema

```
┌────────────────────────────────────────────┐
│  Capa de Presentación (React)              │
│  pages/, components/, layouts/             │
├────────────────────────────────────────────┤
│  Capa de Estado (Context API)              │
│  AuthContext, NotificacionesContext,       │
│  ThemeContext, AppReadyContext             │
├────────────────────────────────────────────┤
│  Capa de Acceso a Datos (DAL)             │
│  client/src/lib/db.js                     │
│  Supabase JS client (anon key)            │
├────────────────────────────────────────────┤
│  API Backend (Express)                     │
│  server/index.js                          │
│  server/routes/notificaciones.js          │
│  server/routes/grupos.js                  │
│  server/services/                         │
├────────────────────────────────────────────┤
│  Base de Datos (Supabase PostgreSQL + RLS) │
│  server/db/schema.sql                     │
└────────────────────────────────────────────┘
```

### Flujo de una request típica (registro de gasto)

```
1. Usuario completa formulario en Dashboard.jsx
2. handleGuardar() llama a db.createExpense(gasto)
3. db.js obtiene la sesión activa (getSession)
4. db.js llama a supabase.from('gastos').insert([...])
5. Supabase valida el JWT → ejecuta política RLS
   → solo permite insertar si user_id = auth.uid()
6. Registro guardado → retorna el gasto creado
7. fetchStats() refresca las estadísticas del dashboard
8. agregarNotificacion() crea la notificación in-app
```

---

## 3. Estructura de Directorios

```
tusgastosapp/
├── CLAUDE.md                     ← Instrucciones del proyecto para el AI
├── TECHNICAL_DOCS.md             ← Este documento
├── package.json                  ← Scripts raíz (install-all, dev)
├── .gitignore
│
├── client/                       ← Frontend React + Vite
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── .env                      ← VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
│   └── src/
│       ├── App.jsx               ← Router raíz, layout y rutas
│       ├── index.css             ← Variables CSS, temas, estilos globales
│       ├── lib/
│       │   ├── db.js             ← [PUNTO DE ENTRADA DAL] Todas las queries a Supabase
│       │   └── supabase.js       ← Instancia del cliente Supabase (anon key)
│       ├── context/
│       │   ├── AuthContext.jsx   ← [PUNTO DE ENTRADA AUTH] Sesión, login, logout
│       │   ├── NotificacionesContext.jsx  ← Alertas financieras y notificaciones
│       │   ├── ThemeContext.jsx           ← Tema de la UI (persistido en DB)
│       │   └── AppReadyContext.jsx        ← Control del loader inicial
│       ├── pages/
│       │   ├── Welcome.jsx       ← Pantalla de login (Google OAuth)
│       │   ├── Dashboard.jsx     ← [PRINCIPAL] Resumen financiero y registro de gastos
│       │   ├── Movements.jsx     ← Historial, búsqueda y edición de movimientos
│       │   ├── Reportes.jsx      ← Análisis por rango de fechas
│       │   ├── Configuracion.jsx ← Preferencias, categorías, notificaciones
│       │   └── grupos/
│       │       ├── Grupos.jsx         ← Lista de grupos
│       │       ├── GrupoNuevo.jsx     ← Crear grupo
│       │       ├── GrupoDetalle.jsx   ← Detalle y gastos del grupo
│       │       ├── GrupoSaldos.jsx    ← Saldos y transferencias sugeridas
│       │       ├── GrupoGastoNuevo.jsx   ← Registrar gasto grupal
│       │       ├── GrupoGastoEditar.jsx  ← Editar gasto grupal
│       │       └── AceptarInvitacion.jsx ← Flujo de aceptación de invitación
│       ├── components/
│       │   ├── GlassCard.jsx          ← Tarjeta glassmorphism base
│       │   ├── Modal.jsx              ← Modal genérico
│       │   ├── ConfirmModal.jsx       ← Modal de confirmación para acciones destructivas
│       │   ├── CurrencyInput.jsx      ← Input numérico para montos en pesos
│       │   ├── Header.jsx             ← Barra superior de navegación
│       │   ├── Sidebar.jsx            ← Menú lateral
│       │   ├── ProtectedRoute.jsx     ← Guardia de rutas privadas
│       │   ├── NotificacionesPanel.jsx ← Panel de notificaciones in-app
│       │   ├── AppLoader.jsx          ← Loader de inicio de sesión
│       │   ├── WelcomeTour.jsx        ← Tour de bienvenida para nuevos usuarios
│       │   ├── dashboard/
│       │   │   ├── SummaryCard.jsx         ← Tarjeta de resumen financiero
│       │   │   ├── DashboardTable.jsx      ← Tabla de gastos del dashboard
│       │   │   ├── DashboardSkeleton.jsx   ← Skeleton loader del dashboard
│       │   │   └── TarjetasCuotasCard.jsx  ← Panel de cuotas de tarjeta
│       │   └── grupos/
│       │       ├── GrupoCard.jsx           ← Tarjeta de grupo en el listado
│       │       ├── GrupoTabs.jsx           ← Tabs de navegación dentro del grupo
│       │       ├── MiembrosSelector.jsx    ← Selector de participantes
│       │       ├── MiembroChip.jsx         ← Chip de miembro seleccionado
│       │       ├── TransferenciasSugeridas.jsx ← Sugerencias de liquidación
│       │       ├── SaldoTable.jsx          ← Tabla de saldos del grupo
│       │       ├── GrupoGastoRow.jsx       ← Fila de gasto grupal
│       │       └── InvitarMiembroModal.jsx ← Modal de invitación por email
│       ├── layouts/               ← Layout principal con Header/Sidebar
│       └── utils/
│           └── format.js         ← Helpers de formato (moneda, fechas Argentina)
│
└── server/                        ← Backend Express
    ├── package.json
    ├── .env                        ← PORT, SUPABASE_URL, SUPABASE_KEY, N8N_API_KEY, FRONTEND_URL
    ├── index.js                    ← [PUNTO DE ENTRADA] Express app, CORS, middlewares, endpoints
    ├── utils.js                    ← normalizeAmount, generateFingerprint (idempotencia n8n)
    ├── routes/
    │   ├── notificaciones.js       ← POST /api/notifications/email
    │   └── grupos.js               ← Endpoints de grupos, invitaciones, gastos grupales
    ├── services/
    │   ├── supabaseAdmin.js        ← Cliente Supabase con service role key
    │   ├── email.js                ← Envío de emails via SMTP (nodemailer)
    │   ├── notificaciones.js       ← Builders de notificaciones y lógica de envío
    │   └── notificacionesDb.js     ← Helpers de persistencia de notificaciones en DB
    └── db/
        ├── schema.sql              ← Schema completo vigente de la DB
        └── migrations/
            ├── 20260507_grupos_gastos_compartidos.sql
            └── 20260509_cuotas_tarjeta_credito.sql
```

---

## 4. Base de Datos (Schema SQL)

### Tablas principales

#### `categorias`
Clasifica los gastos del usuario. Puede ser global (`user_id IS NULL`) o personal del usuario.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `user_id` | UUID FK → auth.users | NULL = global; UUID = categoría personal |
| `nombre` | VARCHAR(255) NOT NULL | Nombre de la categoría (en mayúsculas) |
| `fecha_creacion` | TIMESTAMPTZ | Fecha de creación (default NOW()) |

#### `metodos_pago`
Métodos de pago disponibles. Son globales (pre-configurados, ningún usuario puede insertarlos).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `user_id` | UUID FK → auth.users | Referencia de usuario (global) |
| `nombre` | VARCHAR(100) NOT NULL | Ej: EFECTIVO, TARJETA DE CREDITO |
| `activo` | BOOLEAN | Si está disponible para seleccionar |
| `fecha_creacion` | TIMESTAMPTZ | Fecha de creación |

#### `gastos`
Registro central de gastos del usuario. Soporta cuotas de tarjeta de crédito.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `user_id` | UUID FK → auth.users | Propietario del gasto |
| `descripcion` | TEXT NOT NULL | Descripción en MAYÚSCULAS |
| `monto` | DECIMAL(12,2) NOT NULL | Monto del gasto |
| `id_categoria` | BIGINT FK → categorias | Categoría del gasto |
| `id_metodo_pago` | BIGINT FK → metodos_pago | Método de pago |
| `fecha` | TIMESTAMPTZ | Fecha del gasto |
| `es_fijo` | BOOLEAN | true = fijo mensual; false = variable |
| `huella_digital` | VARCHAR(64) | SHA para idempotencia (n8n) |
| `fecha_creacion` | TIMESTAMPTZ | Timestamp de creación |
| `cuotas` | SMALLINT (1-18) | Cantidad total de cuotas |
| `numero_cuota` | SMALLINT | Número de cuota actual (1-N) |
| `id_gasto_padre` | BIGINT FK → gastos (CASCADE) | Vincula cuotas al gasto raíz |

#### `ingresos`
Un único registro por usuario que representa el ingreso mensual declarado.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `user_id` | UUID FK → auth.users UNIQUE | Un ingreso por usuario |
| `monto` | DECIMAL(12,2) | Ingreso mensual |
| `fecha` | DATE | Fecha de referencia |
| `fecha_actualizacion` | TIMESTAMPTZ | Última actualización |

#### `usuarios`
Perfil extendido del usuario (preferencias de UI).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK FK → auth.users | Mismo UUID que el usuario de auth |
| `theme_id` | VARCHAR(50) | ID del tema activo (ej: 'indigo-light') |
| `ultima_actualizacion` | TIMESTAMPTZ | Última actualización del perfil |

#### `notificaciones`
Notificaciones in-app con soporte de email.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `user_id` | UUID FK → auth.users | Destinatario |
| `titulo` | TEXT NOT NULL | Título de la notificación |
| `mensaje` | TEXT NOT NULL | Cuerpo del mensaje |
| `tipo` | VARCHAR(20) | info / success / warning / error |
| `leida` | BOOLEAN | Si fue leída por el usuario |
| `origen` | VARCHAR(30) | app / gastos / n8n / grupos / sistema / etc. |
| `metadata` | JSONB | Datos adicionales (descripción del gasto, etc.) |
| `email_enviado` | BOOLEAN | Si se envió el email |
| `email_error` | TEXT | Mensaje de error SMTP si falló |
| `fecha_creacion` | TIMESTAMPTZ | Timestamp de creación |

#### `configuracion_notificaciones`
Preferencias de notificaciones por usuario (un registro por usuario).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `user_id` | UUID UNIQUE | Propietario de la configuración |
| `email_habilitado` | BOOLEAN | Activa/desactiva todos los emails |
| `email_notificaciones_n8n` | BOOLEAN | Emails de gastos registrados desde WhatsApp |
| `email_saldo_bajo` | BOOLEAN | Emails de alerta de saldo bajo |
| `email_gasto_alto` | BOOLEAN | Emails de alerta de gasto alto |
| `email_resumen_diario/semanal/mensual` | BOOLEAN | Emails de resumen |
| `notificar_saldo_bajo` | BOOLEAN | Alerta in-app de saldo bajo |
| `umbral_saldo_bajo` | DECIMAL | Monto mínimo de saldo para alertar |
| `porcentaje_maximo_ingreso` | DECIMAL | % del ingreso a partir del cual alertar |
| `monto_gasto_alto` | DECIMAL | Monto de gasto individual que dispara alerta |
| `umbral_fijos_ingreso` | DECIMAL | % de gastos fijos sobre ingreso |
| `margen_crecimiento_variables` | DECIMAL | % de crecimiento de variables para alertar |
| `porcentaje_concentracion_categoria` | DECIMAL | % de concentración en una categoría |
| `objetivo_ahorro_porcentaje` | DECIMAL | Objetivo de ahorro mensual |

### Tablas de Grupos de Gastos Compartidos

#### `grupos_gastos`
Grupo de personas que comparten gastos.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `nombre` | VARCHAR(120) NOT NULL | Nombre del grupo |
| `descripcion` | TEXT | Descripción opcional |
| `creado_por` | UUID FK → auth.users RESTRICT | Creador del grupo |
| `moneda` | VARCHAR(8) | Moneda (default: ARS) |
| `archivado` | BOOLEAN | Soft delete del grupo |
| `fecha_creacion` | TIMESTAMPTZ | Fecha de creación |
| `fecha_actualizacion` | TIMESTAMPTZ | Última modificación |

#### `grupo_miembros`
Membresías activas o removidas dentro de un grupo.

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `grupo_id` | BIGINT FK → grupos_gastos CASCADE | Grupo al que pertenece |
| `user_id` | UUID FK → auth.users CASCADE | Miembro |
| `rol` | VARCHAR(20) | admin / miembro |
| `estado` | VARCHAR(20) | activo / removido |
| `alias` | VARCHAR(80) | Nombre alternativo en el grupo |
| `UNIQUE(grupo_id, user_id)` | — | Un miembro por grupo |

#### `grupo_invitaciones`
Invitaciones por email con token UUID de 7 días de vigencia.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `token` | UUID UNIQUE | Token de aceptación (generado por SQL) |
| `email_invitado` | VARCHAR(255) | Email del destinatario |
| `estado` | VARCHAR(20) | pendiente / aceptada / rechazada / expirada / cancelada |
| `fecha_expiracion` | TIMESTAMPTZ | NOW() + 7 días |

#### `grupo_gastos`
Gastos registrados dentro de un grupo.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `grupo_id` | BIGINT FK → grupos_gastos CASCADE | Grupo del gasto |
| `monto` | DECIMAL(12,2) CHECK > 0 | Monto total |
| `pagado_por` | UUID FK → auth.users RESTRICT | Quien pagó |
| `estado` | VARCHAR(20) | activo / anulado |
| `creado_por` | UUID FK | Quien registró el gasto |

#### `grupo_gasto_participantes`
División del gasto entre participantes.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `gasto_id` | BIGINT FK → grupo_gastos CASCADE | Gasto que se divide |
| `user_id` | UUID FK → auth.users RESTRICT | Participante |
| `monto_asignado` | DECIMAL(12,2) CHECK >= 0 | Monto que debe pagar |
| `UNIQUE(gasto_id, user_id)` | — | Un participante por gasto |

#### `grupo_liquidaciones`
Pagos reales entre miembros para saldar deudas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `de_user_id` | UUID | Quien paga la deuda |
| `para_user_id` | UUID | Quien cobra |
| `estado` | VARCHAR(20) | confirmada / anulada |
| `CHECK de_user_id <> para_user_id` | — | No puede liquidarse a sí mismo |

### Políticas RLS

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `categorias` | user_id IS NULL OR = auth.uid() | auth.uid() = user_id | — | auth.uid() = user_id |
| `metodos_pago` | todos | false | false | false |
| `gastos` | auth.uid() = user_id | auth.uid() = user_id | auth.uid() = user_id | auth.uid() = user_id |
| `ingresos` | auth.uid() = user_id | auth.uid() = user_id | auth.uid() = user_id | auth.uid() = user_id |
| `usuarios` | auth.uid() = id | auth.uid() = id | auth.uid() = id | — |
| `notificaciones` | auth.uid() = user_id | auth.uid() = user_id | auth.uid() = user_id | auth.uid() = user_id |
| `grupos_gastos` | is_group_member(id) | creado_por = auth.uid() | is_group_admin(id) | is_group_admin(id) |
| `grupo_miembros` | user_id = auth.uid() OR is_group_member | is_group_admin | is_group_admin | — |
| `grupo_gastos` | is_group_member | is_group_member AND creado_por | creado_por o is_group_admin | — |
| `grupo_liquidaciones` | is_group_member | is_group_member | registrado_por o is_group_admin | — |

### Funciones y Triggers

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `is_group_member(grupo_id, user_id)` | FUNCTION SECURITY DEFINER | Verifica si el usuario es miembro activo de un grupo. Evita recursión en RLS. |
| `is_group_admin(grupo_id, user_id)` | FUNCTION SECURITY DEFINER | Verifica si el usuario es admin activo de un grupo. |
| `is_group_creator(grupo_id, user_id)` | FUNCTION SECURITY DEFINER | Verifica si el usuario creó el grupo. |
| `crear_grupo_gasto_compartido(nombre, descripcion, moneda)` | RPC SECURITY DEFINER | Crea un grupo usando auth.uid() del llamador. Retorna el ID creado. |
| `aceptar_invitacion_grupo(token, user_id)` | RPC SECURITY DEFINER | Transacción atómica: marca invitación aceptada + inserta miembro activo. |
| `grupos_set_updated_at()` | TRIGGER FUNCTION | Actualiza `fecha_actualizacion` en grupos_gastos ante cada UPDATE. |
| `grupos_alta_admin_creador()` | TRIGGER FUNCTION | Al crear un grupo, agrega automáticamente al creador como admin. |

### Vista de Saldos

```sql
-- vw_grupo_saldos
-- Saldo neto por miembro = pagado + liquidado_enviado - asignado - liquidado_recibido
-- saldo_neto > 0: te deben  |  saldo_neto < 0: debés
```

### Índices

| Índice | Tabla | Columna(s) |
|--------|-------|-----------|
| `idx_gastos_user_id` | gastos | user_id |
| `idx_gastos_fecha` | gastos | fecha |
| `idx_gastos_id_categoria` | gastos | id_categoria |
| `idx_gastos_es_fijo` | gastos | es_fijo |
| `idx_gastos_huella_digital` | gastos | huella_digital |
| `idx_gastos_id_gasto_padre` | gastos | id_gasto_padre |
| `idx_categorias_user_id` | categorias | user_id |
| `idx_grupo_miembros_user_activo` | grupo_miembros | user_id WHERE estado='activo' |
| `idx_grupo_gastos_activos` | grupo_gastos | grupo_id WHERE estado='activo' |
| `idx_notificaciones_leida` | notificaciones | (user_id, leida) |

---

## 5. API y Endpoints

### Middlewares globales

| Middleware | Descripción |
|-----------|-------------|
| **CORS** | Origen explícito desde `FRONTEND_URL`. En producción es obligatorio. En desarrollo acepta `http://localhost:5173`. |
| **express.json({ limit: '10kb' })** | Límite estricto de payload para prevenir abusos. |
| **validateApiKey** | Verifica el header `x-api-key` contra `N8N_API_KEY`. Aplica solo a los endpoints de integración. |
| **requireAuth** (grupos) | Extrae el JWT del header `Authorization: Bearer <token>`, lo valida con Supabase service role y adjunta `req.user`. |

### Endpoints disponibles

#### `GET /health`
Verifica que el servidor está en pie.

| Campo | Valor |
|-------|-------|
| Autenticación | Ninguna |
| Respuesta exitosa | `{ "status": "ok" }` |

---

#### `POST /api/integrations/n8n/gasto`
Registra un gasto enviado desde n8n (WhatsApp). Incluye control de duplicados por huella digital.

| Campo | Valor |
|-------|-------|
| Autenticación | Header `x-api-key: <N8N_API_KEY>` |
| Content-Type | application/json |

**Body esperado:**
```json
{
  "descripcion": "SUPER 123",
  "monto": 5000,
  "categoria": 1,
  "medioPago": 2,
  "user_id": "uuid-del-usuario",
  "email_usuario": "usuario@email.com"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `descripcion` | string | Sí | 1-500 caracteres |
| `monto` | number/string | Sí | Acepta coma como separador decimal |
| `categoria` | number | Sí | ID entero de categoría |
| `medioPago` | number | Sí | ID entero de método de pago |
| `user_id` | UUID | Sí | UUID del usuario destino |
| `email_usuario` | string | No | Para envío de notificación por email |

**Respuesta exitosa (gasto creado):**
```json
{ "ok": true, "created": true, "duplicated": false, "message": "Gasto registrado correctamente", "expense": { ... } }
```

**Respuesta duplicado detectado:**
```json
{ "ok": true, "created": false, "duplicated": true, "message": "Gasto duplicado detectado — no se registró" }
```

**Errores posibles:**
| Código | Motivo |
|--------|--------|
| 400 | Faltan campos, monto inválido, UUID inválido, email inválido |
| 401 | x-api-key ausente o incorrecta |
| 500 | Error interno o Supabase no configurado en producción |

---

#### `POST /api/notifications/email`
Envía un email de notificación al usuario autenticado.

| Campo | Valor |
|-------|-------|
| Autenticación | Header `Authorization: Bearer <access_token>` |

**Body esperado:**
```json
{
  "notificacion": {
    "titulo": "Título",
    "mensaje": "Cuerpo del mensaje",
    "tipo": "info",
    "origen": "gastos",
    "fecha_creacion": "2026-05-09T12:00:00Z",
    "metadata": {}
  }
}
```

**Respuesta:**
```json
{ "ok": true, "emailEnviado": true, "emailError": null }
```

---

#### Endpoints de Grupos (`/api/grupos`)

Todos requieren `Authorization: Bearer <access_token>`.

| Método | Path | Descripción | Auth requerida |
|--------|------|-------------|---------------|
| `POST` | `/api/grupos/:grupoId/invitaciones` | Invitar un miembro por email | Admin del grupo |
| `POST` | `/api/grupos/:grupoId/invitaciones/registro` | Email para registrar usuario nuevo | Admin del grupo |
| `POST` | `/api/grupos/invitaciones/aceptar` | Aceptar invitación con token UUID | Miembro invitado |
| `GET` | `/api/grupos/:grupoId/usuarios/buscar?email=...` | Buscar usuario por email | Admin del grupo |
| `GET` | `/api/grupos/:grupoId/miembros/perfiles` | Obtener nombres de miembros activos | Miembro activo |
| `DELETE` | `/api/grupos/:grupoId` | Eliminar grupo (requiere saldos en cero) | Admin del grupo |
| `POST` | `/api/grupos/:grupoId/gastos` | Crear gasto grupal con participantes | Miembro activo |
| `PUT` | `/api/grupos/:grupoId/gastos/:gastoId` | Editar gasto grupal | Quien pagó |
| `PATCH` | `/api/grupos/:grupoId/gastos/:gastoId/anular` | Anular gasto grupal | Quien pagó |
| `POST` | `/api/grupos/:grupoId/liquidaciones` | Registrar liquidación entre miembros | Miembro activo |
| `PATCH` | `/api/grupos/:grupoId/liquidaciones/:liqId/anular` | Anular liquidación | Registrador o admin |

---

## 6. Autenticación y Seguridad

### Proveedor de autenticación

Supabase Auth con **Google OAuth 2.0**. Toda la sesión se maneja con JWT.

### Flujo de login

```
1. Usuario hace click en "Iniciar sesión con Google" (Welcome.jsx)
2. signInWithGoogle() llama a supabase.auth.signInWithOAuth({ provider: 'google' })
3. Supabase redirige a Google para consentimiento
4. Google redirige a <FRONTEND_URL>/ con el código OAuth
5. Supabase intercambia el código por tokens (access_token + refresh_token)
6. AuthContext recibe el evento SIGNED_IN en onAuthStateChange
7. Si hay un pending_invitation_token en localStorage → redirige al flujo de invitación
8. setUser(session.user) → la app accede a las rutas privadas
```

### Flujo de logout

```
1. signOut() llama a supabase.auth.signOut({ scope: 'global' })
2. Invalida todos los tokens del usuario en todos los dispositivos
3. setUser(null) → ProtectedRoute redirige a /welcome
```

### Uso de claves

| Clave | Dónde se usa | Alcance |
|-------|-------------|---------|
| `VITE_SUPABASE_ANON_KEY` | Frontend (bundle público) | Solo lee/escribe según RLS del usuario autenticado |
| `SUPABASE_KEY` (service role) | Backend Express únicamente | Acceso completo sin RLS — nunca en frontend |

### Row Level Security (RLS)

Cada tabla tiene RLS habilitado. Las políticas garantizan que:
- Un usuario **solo puede ver y modificar sus propios datos**
- El anon key del frontend no puede acceder a datos de otros usuarios aunque se intercepte
- Las operaciones de grupos usan funciones `SECURITY DEFINER` para evitar recursión en las políticas

### Idempotencia — huella digital (n8n)

Antes de insertar un gasto desde n8n, el backend genera un hash SHA de los datos del gasto:

```
fingerprint = SHA256(descripcion + monto + categoria + medioPago + fecha)
```

Este hash se guarda en la columna `huella_digital`. Si ya existe un registro con ese hash, el gasto no se inserta y se retorna `duplicated: true`. Esto previene registros dobles por reenvíos de WhatsApp.

Los helpers `normalizeAmount` y `generateFingerprint` están en `server/utils.js` y **nunca deben eliminarse**.

---

## 7. Módulos Funcionales

### 7.1 Dashboard

**Descripción funcional:** Pantalla principal. Muestra el resumen financiero del mes actual (ingresos, saldo disponible, total de gastos fijos y variables). Permite registrar nuevos gastos y actualizar el ingreso mensual.

**Reglas de negocio:**
- Gastos del mes: filtra por el rango del mes actual en zona Argentina (UTC-3)
- Saldo disponible = ingreso mensual − total gastos
- Ahorro estimado = 20% del ingreso mensual (referencia visual)
- Descripción del gasto → MAYÚSCULAS antes de guardar
- Gastos con tarjeta de crédito → se generan N registros (cuotas) a partir del mes siguiente

**Páginas y componentes:** [Dashboard.jsx](client/src/pages/Dashboard.jsx), `SummaryCard`, `DashboardTable`, `DashboardSkeleton`, `TarjetasCuotasCard`, `Modal`, `ConfirmModal`, `CurrencyInput`

**Funciones de db.js:** `getStats()`, `createExpense()`, `deleteVariableExpenses()`, `getCategories()`, `getPaymentMethods()`, `saveIncome()`, `getTarjetasEnCuotas()`

---

### 7.2 Movimientos

**Descripción funcional:** Historial completo de gastos. Permite buscar por descripción, filtrar por categoría, editar gastos individuales y eliminarlos. Muestra también los movimientos futuros (cuotas pendientes de tarjeta de crédito).

**Reglas de negocio:**
- Solo se pueden eliminar gastos variables (`es_fijo = false`)
- La eliminación requiere confirmación vía `ConfirmModal`
- La edición no permite cambiar el tipo fijo/variable de cuotas
- Los gastos futuros son cuotas de tarjeta a partir del mes siguiente

**Páginas y componentes:** [Movements.jsx](client/src/pages/Movements.jsx), `Modal`, `ConfirmModal`, `CurrencyInput`, `GlassCard`

**Funciones de db.js:** `getExpenses()`, `updateExpense()`, `deleteExpense()`, `getGastosFuturos()`, `deleteExpenseGroup()`, `updateExpenseGroup()`, `getCategories()`, `getPaymentMethods()`

---

### 7.3 Tarjeta de Crédito en Cuotas

**Descripción funcional:** Al registrar un gasto con tarjeta de crédito, la app genera automáticamente N registros de cuota (1 a 18), cada uno con fecha en meses consecutivos a partir del mes siguiente.

**Reglas de negocio:**
- El monto de cada cuota = monto_total / N (redondeado a centavos)
- La diferencia de redondeo va a la primera cuota
- Todas las cuotas son gastos fijos (`es_fijo = true`)
- Las cuotas se vinculan entre sí por `id_gasto_padre`
- El panel `TarjetasCuotasCard` muestra el estado de cada compra (pagadas vs. pendientes)

**Funciones de db.js:** `createExpense()` (con `esTarjetaCredito: true`), `getTarjetasEnCuotas()`, `getGastosFuturos()`, `deleteExpenseGroup()`, `updateExpenseGroup()`

---

### 7.4 Reportes

**Descripción funcional:** Análisis de gastos por rango de fechas configurable. Muestra totales, desglose por categoría y por método de pago, y evolución diaria del gasto.

**Páginas y componentes:** [Reportes.jsx](client/src/pages/Reportes.jsx), `GlassCard`

**Funciones de db.js:** `getReporteByRango(desde, hasta)`, `getGastosByRango(desde, hasta)`

---

### 7.5 Ingresos

**Descripción funcional:** El usuario declara su ingreso mensual una única vez. Este valor es la base para calcular el saldo disponible y las alertas financieras.

**Reglas de negocio:**
- Un solo registro por usuario (UNIQUE constraint en `ingresos.user_id`)
- Si no existe, el sistema lo trata como 0
- El upsert garantiza que no se crean duplicados

**Funciones de db.js:** `getIncome()`, `saveIncome(monto)`

---

### 7.6 Categorías

**Descripción funcional:** El usuario puede ver categorías globales y crear categorías personales. Las categorías personales pueden eliminarse si no tienen gastos asociados.

**Reglas de negocio:**
- Categorías globales (`user_id IS NULL`): visibles para todos, no modificables
- Categorías personales: solo visibles y modificables por su creador
- No se puede eliminar una categoría si tiene gastos asociados (FK RESTRICT)

**Funciones de db.js:** `getCategories()`, `createCategory(nombre)`, `deleteCategory(id)`

---

### 7.7 Notificaciones

**Descripción funcional:** Sistema de notificaciones in-app con soporte de email. Las notificaciones se crean automáticamente al registrar, editar o eliminar gastos, y ante eventos financieros relevantes.

**Tipos de origen:**
- `gastos` — operaciones de gastos (creado, editado, eliminado)
- `n8n` / `whatsapp` — gastos cargados desde WhatsApp
- `grupos` — actividad en grupos compartidos (siempre envía email)
- `alertas_financieras` — saldo bajo, gasto alto, concentración por categoría
- `resumen` / `proyeccion` — resúmenes periódicos

**Reglas de negocio:**
- Las notificaciones de grupos (`origen = 'grupos'`) siempre se envían por email si hay SMTP configurado, independientemente de la configuración del usuario
- El envío de email es fire-and-forget: nunca interrumpe el flujo principal
- Límite: últimas 50 notificaciones por usuario

**Contexto:** [NotificacionesContext.jsx](client/src/context/NotificacionesContext.jsx)
**Funciones de db.js:** `getNotificaciones()`, `createNotificacion()`, `marcarLeida(id)`, `marcarTodasLeidas()`, `getConfigNotificaciones()`, `saveConfigNotificaciones(config)`

---

### 7.8 Grupos de Gastos Compartidos

**Descripción funcional:** Permite crear grupos de personas para dividir gastos. Un admin invita miembros por email, registra gastos con participantes, y la app calcula automáticamente los saldos y sugiere cómo liquidar las deudas.

**Reglas de negocio:**
- Al crear un grupo, el creador queda automáticamente como admin (trigger)
- La división de gastos es siempre igualitaria entre los participantes seleccionados
- La diferencia de centavos por redondeo va al pagador (o al primer participante)
- Solo quien pagó puede editar o anular un gasto grupal
- Solo admins pueden eliminar el grupo (y solo si todos los saldos son cero)
- Las invitaciones expiran a los 7 días
- Máximo 10 invitaciones por grupo por hora (rate limiting in-memory)
- El grupo puede archivarse (soft delete) sin eliminar los datos históricos

**Fórmula de saldo neto:**
```
saldo_neto = pagado + liquidado_enviado − asignado − liquidado_recibido
```
- Positivo: te deben dinero
- Negativo: debés dinero

**Páginas:** `Grupos.jsx`, `GrupoDetalle.jsx`, `GrupoSaldos.jsx`, `GrupoNuevo.jsx`, `GrupoGastoNuevo.jsx`, `GrupoGastoEditar.jsx`, `AceptarInvitacion.jsx`

**Funciones de db.js:** `crearGrupo()`, `actualizarGrupo()`, `archivarGrupo()`, `eliminarGrupo()`, `obtenerGruposDelUsuario()`, `obtenerMiembrosDelGrupo()`, `crearGastoGrupal()`, `obtenerGastosDelGrupo()`, `anularGastoGrupal()`, `registrarLiquidacion()`, `obtenerSaldosDelGrupo()`

---

### 7.9 Configuración

**Descripción funcional:** Pantalla de preferencias del usuario. Permite gestionar categorías personales, configurar el tema visual y personalizar qué notificaciones recibir y si se envían por email.

**Páginas y componentes:** [Configuracion.jsx](client/src/pages/Configuracion.jsx), `GlassCard`

---

## 8. Integraciones Externas

### n8n / WhatsApp

El flujo permite registrar gastos enviando un mensaje de WhatsApp que n8n procesa y envía al backend.

**Endpoint:** `POST /api/integrations/n8n/gasto`  
**Autenticación:** Header `x-api-key: <N8N_API_KEY>`

**Flujo completo:**
```
1. Usuario envía mensaje de WhatsApp: "Almuerzo 850 comida efectivo"
2. n8n parsea el mensaje y extrae descripcion, monto, categoria, medioPago
3. n8n hace POST a http://<server>/api/integrations/n8n/gasto con x-api-key
4. Servidor valida API key, formato y campos
5. Genera fingerprint = SHA256(datos) → busca en gastos.huella_digital
6. Si existe → retorna duplicado (ok: true, duplicated: true)
7. Si no existe → inserta el gasto en Supabase (con service role)
8. Dispara notificación in-app (fire-and-forget)
9. Si emailUsuario configurado → envía email de confirmación
```

**Campos que acepta el monto:** número, string con punto (`"850.50"`) o con coma (`"850,50"`). La función `normalizeAmount` en `server/utils.js` normaliza la coma a punto.

---

### Email (SMTP via nodemailer)

El servidor envía emails de notificación cuando el usuario tiene SMTP configurado.

**Configuración:** variables de entorno SMTP en `server/.env`  
**Trigger:** cualquier evento que genere una notificación con `email_habilitado: true` en la configuración del usuario, o cualquier notificación de grupos.

**Tipos de emails:**
- Confirmación de gasto registrado desde n8n
- Alerta de saldo bajo
- Alerta de gasto alto
- Resúmenes diarios/semanales/mensuales
- Notificaciones de actividad en grupos (siempre)
- Invitaciones a grupos

Si SMTP no está configurado, el sistema sigue funcionando sin enviar emails (falla silenciosa).

---

## 9. Variables de Entorno

### Frontend (`client/.env`)

| Variable | Expuesta al browser | Requerida | Descripción |
|----------|-------------------|-----------|-------------|
| `VITE_SUPABASE_URL` | Sí (VITE_*) | Sí | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Sí (VITE_*) | Sí | Clave pública de Supabase (anon key) |
| `VITE_BACKEND_URL` | Sí (VITE_*) | No | URL del backend Express (en producción) |

> **Importante:** Las variables `VITE_*` quedan embebidas en el bundle JavaScript y son visibles para cualquier usuario. Nunca deben contener la service role key.

### Backend (`server/.env`)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `PORT` | No | Puerto del servidor (default: 3001) |
| `NODE_ENV` | No | `production` o `development` |
| `SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `SUPABASE_KEY` | Sí | **Service role key** — acceso completo sin RLS |
| `N8N_API_KEY` | Sí | Clave de autenticación para el endpoint n8n |
| `FRONTEND_URL` | Sí (producción) | URL del frontend (para CORS y links en emails) |
| Variables SMTP | No | Credenciales SMTP para envío de emails |

---

## 10. Manual de Uso

### Requisitos previos

- Node.js 18+ instalado
- Cuenta en [Supabase](https://supabase.com) con proyecto creado
- Credenciales de Google OAuth configuradas en el proyecto Supabase

### Instalación

```bash
# Clonar el repositorio
git clone <url-del-repositorio>
cd tusgastosapp

# Instalar todas las dependencias (raíz + cliente + servidor)
npm run install-all
```

### Configuración de variables de entorno

```bash
# Frontend
cp client/.env.example client/.env
# Editar client/.env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY

# Backend
cp server/.env.example server/.env
# Editar server/.env con PORT, SUPABASE_URL, SUPABASE_KEY, N8N_API_KEY, FRONTEND_URL
```

### Aplicar el schema de base de datos

1. Abrir el proyecto en [Supabase](https://app.supabase.com)
2. Ir a **SQL Editor**
3. Pegar el contenido de `server/db/schema.sql` y ejecutarlo
4. Para migraciones posteriores, ejecutar los archivos en `server/db/migrations/` en orden cronológico

### Iniciar en modo desarrollo

```bash
npm run dev
# → Frontend en http://localhost:5173
# → Backend en http://localhost:3001
```

### Comandos disponibles

```bash
npm run dev                        # Cliente + servidor en paralelo
npm run client                     # Solo el cliente Vite
npm run server                     # Solo el servidor Express
npm --prefix client run lint       # Lint del código frontend
npm --prefix client run build      # Build de producción del frontend
npm --prefix server run dev        # Servidor con nodemon (recarga automática)
```

### Verificar que el servidor está activo

```bash
curl http://localhost:3001/health
# → { "status": "ok" }
```

### Probar el endpoint n8n

```bash
curl -X POST http://localhost:3001/api/integrations/n8n/gasto \
  -H "Content-Type: application/json" \
  -H "x-api-key: <N8N_API_KEY>" \
  -d '{
    "descripcion": "ALMUERZO TEST",
    "monto": 1500,
    "categoria": 1,
    "medioPago": 2,
    "user_id": "<UUID_DEL_USUARIO>"
  }'
```

### Aplicar una migración nueva

1. Crear el archivo `server/db/migrations/YYYYMMDD_descripcion.sql`
2. Redactar el cambio incremental en SQL
3. Ejecutar en Supabase → SQL Editor
4. Actualizar `server/db/schema.sql` con el estado completo resultante

### Troubleshooting común

| Problema | Solución |
|----------|----------|
| CORS error en el browser | Verificar que `FRONTEND_URL` en `server/.env` coincide exactamente con el origen del browser |
| Error 401 en el endpoint n8n | Verificar que el header `x-api-key` coincide con `N8N_API_KEY` |
| Error 400 "Datos de usuario inválidos" | El `user_id` enviado no existe en la tabla `usuarios` o el UUID tiene formato incorrecto |
| Gasto no aparece en el dashboard | Verificar que la `fecha` del gasto cae dentro del mes actual en zona Argentina |
| Error de RLS en Supabase | Asegurarse de que la tabla tiene RLS habilitado y la policy usa `auth.uid()` correctamente |
| Emails no se envían | Verificar las variables SMTP en `server/.env`. Si SMTP no está configurado, el sistema falla silenciosamente |
| Cuotas de tarjeta no aparecen | El método de pago debe llamarse exactamente `TARJETA DE CREDITO` (mayúsculas) para que el filtro funcione |
