# Documentación Técnico-Funcional — TusGastosApp

> Actualizado el 2026-05-26. Refleja el estado actual del código fuente.

---

## 1. Resumen del Proyecto

**TusGastosApp** es una aplicación web de finanzas personales que permite registrar, clasificar y analizar gastos mensuales. Está orientada a usuarios individuales que quieran llevar un control detallado de su dinero, con soporte para gastos fijos y variables, tarjeta de crédito en cuotas, préstamos en cuotas, grupos de gastos compartidos con otras personas, alertas financieras y registro automático de gastos desde WhatsApp vía n8n.

### Stack tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Frontend** | React 19, Vite 7, JavaScript (sin TypeScript), React Router DOM v7, Supabase JS, Lucide React, Material Symbols, CSS puro |
| **Backend** | Node.js, Express, CommonJS, Supabase JS (service role), dotenv, cors, crypto, nodemon, nodemailer, helmet, compression, express-rate-limit |
| **Base de datos** | Supabase PostgreSQL con RLS obligatorio en todas las tablas |
| **Autenticación** | Supabase Auth — Google OAuth 2.0 |
| **PWA** | vite-plugin-pwa + workbox-window (Service Worker, instalable) |
| **Testing** | vitest (frontend y backend), @vitest/coverage-v8 |
| **Integraciones** | n8n (registro de gastos desde WhatsApp), Email SMTP (notificaciones y invitaciones) |
| **Dev tooling** | concurrently (cliente + servidor en paralelo), eslint |
| **Contenedor** | Docker multi-stage (Node 20 Alpine) |

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
- El **backend Express** actúa como servidor de integraciones: recibe llamadas de n8n/WhatsApp, valida la API key, y escribe en Supabase usando la service role key. También gestiona operaciones que requieren privilegios elevados (búsqueda de usuarios por email, aceptación de invitaciones a grupos, envío de emails, gastos grupales con cuotas).
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
│  client/src/lib/cuotasHelper.js           │
│  client/src/lib/cuotasGroupHelper.js      │
│  client/src/lib/grupos/saldos.js          │
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
├── Dockerfile                    ← Build multi-stage (Node 20 Alpine)
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
│       │   ├── supabase.js       ← Instancia del cliente Supabase (anon key)
│       │   ├── cuotasHelper.js   ← Cálculo puro de cuotas y división igualitaria
│       │   ├── cuotasGroupHelper.js ← Agrupación y transformación de cuotas (puro)
│       │   └── grupos/
│       │       └── saldos.js     ← Algoritmo greedy para minimizar transferencias
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
│       │   ├── Configuracion.jsx ← Preferencias, categorías, notificaciones, tema
│       │   └── grupos/
│       │       ├── Grupos.jsx         ← Lista de grupos
│       │       ├── GrupoNuevo.jsx     ← Crear grupo
│       │       ├── GrupoDetalle.jsx   ← Detalle y gastos del grupo
│       │       ├── GrupoSaldos.jsx    ← Saldos y transferencias sugeridas
│       │       ├── GrupoGastoNuevo.jsx   ← Registrar gasto grupal (incluyendo cuotas)
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
    ├── .env                        ← PORT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_API_KEY, FRONTEND_URL, SMTP_*
    ├── index.js                    ← [PUNTO DE ENTRADA] Express app, CORS, middlewares, endpoints
    ├── utils.js                    ← normalizeAmount, generateFingerprint (idempotencia n8n)
    ├── routes/
    │   ├── notificaciones.js       ← POST /api/notifications/email
    │   └── grupos.js               ← Endpoints de grupos, invitaciones, gastos grupales
    ├── services/
    │   ├── supabaseAdmin.js        ← Cliente Supabase con service role key (singleton lazy)
    │   ├── email.js                ← Envío de emails via SMTP (nodemailer)
    │   ├── notificaciones.js       ← Builders de notificaciones y lógica de envío
    │   └── notificacionesDb.js     ← Helpers de persistencia de notificaciones en DB
    └── db/
        ├── schema.sql              ← Schema completo vigente de la DB
        └── migrations/
            ├── 20260507_grupos_gastos_compartidos.sql
            ├── 20260509_cuotas_tarjeta_credito.sql
            ├── 20260514_fix_rls_categorias.sql
            └── 20260515_cuotas_grupales.sql
```

---

## 4. Base de Datos (Schema SQL)

> El archivo `server/db/schema.sql` contiene el estado completo y vigente. Las migraciones en `server/db/migrations/` representan los cambios incrementales. No existe un schema autogenerado en el repositorio; los cambios se aplican manualmente en Supabase SQL Editor.

### Tablas principales

#### `categorias`
Clasifica los gastos del usuario. Puede ser global (`user_id IS NULL`) o personal del usuario.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `user_id` | UUID FK → auth.users | NULL = global; UUID = categoría personal |
| `nombre` | VARCHAR(255) NOT NULL | Nombre de la categoría (en mayúsculas) |
| `icono` | VARCHAR(50) DEFAULT 'label' | Ícono del chip de categoría (migración 20260716) |
| `es_prestamo` | BOOLEAN DEFAULT false | Reemplaza el string-matching de "PRESTAMOS" por flag explícito (migración 20260716) |
| `fecha_creacion` | TIMESTAMPTZ | Fecha de creación (default NOW()) |

**Política RLS vigente (migración 20260514):** La política anterior era permisiva y podía exponer categorías de otros usuarios. Las nuevas políticas son:
- `categorias_select`: `user_id IS NULL OR auth.uid() = user_id`
- `categorias_insert`: `auth.uid() = user_id`
- `categorias_delete`: `auth.uid() = user_id`

#### `metodos_pago`
Métodos de pago disponibles. Pueden ser globales (pre-configurados) o personales del usuario.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `user_id` | UUID FK → auth.users | Columna nueva agregada en la migración 20260716 (la tabla era 100% global antes, sin esta columna). NULL = global; UUID = método personal. Habilita CRUD real de usuario (antes era de solo lectura global) |
| `nombre` | VARCHAR(100) NOT NULL | Ej: EFECTIVO, TARJETA DE CREDITO |
| `tipo` | VARCHAR(20) DEFAULT 'efectivo' | `efectivo` \| `tarjeta` \| `cuenta` — reemplaza el string-matching de "TARJETA DE CREDITO" (migración 20260716) |
| `acepta_cuotas` | BOOLEAN DEFAULT false | Si el método admite pago en cuotas (migración 20260716) |
| `icono` | VARCHAR(50) DEFAULT 'payments' | Ícono del chip de método de pago (migración 20260716) |
| `activo` | BOOLEAN | Si está disponible para seleccionar |
| `fecha_creacion` | TIMESTAMPTZ | Fecha de creación |

**Política RLS vigente (migración 20260716):** Antes `metodos_pago` solo tenía lectura global, sin policies de insert/update/delete de usuario. Las nuevas políticas son:

- `metodos_pago_select`: `user_id IS NULL OR auth.uid() = user_id`
- `metodos_pago_insert`: `auth.uid() = user_id`
- `metodos_pago_update`: `auth.uid() = user_id`
- `metodos_pago_delete`: `auth.uid() = user_id`

#### `gastos`
Registro central de gastos del usuario. Soporta cuotas de tarjeta de crédito y préstamos.

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
| `huella_digital` | VARCHAR(64) | SHA-256 para idempotencia (n8n) |
| `fecha_creacion` | TIMESTAMPTZ | Timestamp de creación |
| `cuotas` | SMALLINT (1-18) | Cantidad total de cuotas |
| `numero_cuota` | SMALLINT | Número de cuota actual (1-N) |
| `id_gasto_padre` | BIGINT FK → gastos (CASCADE) | Vincula cuotas al gasto raíz (autoref en la primera cuota) |

#### `ingresos`
Registros de ingresos del usuario por fecha. Puede haber múltiples por mes (a diferencia de versiones anteriores con un único registro por usuario).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `user_id` | UUID FK → auth.users | Propietario del ingreso |
| `monto` | DECIMAL(12,2) | Monto del ingreso |
| `fecha` | DATE | Fecha del ingreso |
| `descripcion` | TEXT | Descripción opcional |
| `origen` | VARCHAR(30) | Origen del ingreso (ej: 'manual') |
| `categoria_id` | BIGINT FK → categorias_ingresos | Categoría de ingreso (nullable) |
| `recurrente_id` | BIGINT FK → ingresos_recurrentes | Ingreso recurrente que lo generó (nullable) |
| `fecha_creacion` | TIMESTAMPTZ | Timestamp de creación |
| `fecha_actualizacion` | TIMESTAMPTZ | Última actualización |

#### `ingresos_recurrentes`
Plantillas de ingresos que se esperan mensualmente.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `user_id` | UUID FK → auth.users | Propietario |
| `descripcion` | TEXT NOT NULL | Descripción en MAYÚSCULAS |
| `monto` | DECIMAL(12,2) NOT NULL | Monto esperado |
| `frecuencia` | VARCHAR(20) | 'mensual' (único valor actual) |
| `activo` | BOOLEAN | Si está activo |
| `dia_estimado` | SMALLINT | Día del mes estimado de cobro (1-31) |
| `categoria_id` | BIGINT FK → categorias_ingresos | Categoría del ingreso |
| `fecha_inicio` | DATE | Desde cuándo aplica |
| `fecha_fin` | DATE | Hasta cuándo aplica (nullable) |
| `fecha_creacion` | TIMESTAMPTZ | Timestamp de creación |
| `fecha_actualizacion` | TIMESTAMPTZ | Última actualización |

#### `categorias_ingresos`
Categorías para clasificar los ingresos.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `user_id` | UUID FK → auth.users | NULL = global; UUID = personal |
| `nombre` | VARCHAR(255) NOT NULL | Nombre de la categoría |
| `activa` | BOOLEAN | Si está disponible |

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
| `email_alertas_gastos_fijos` | BOOLEAN | Emails de alertas de gastos fijos |
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
| `grupo_id` | BIGINT FK → grupos_gastos | Grupo al que se invita |
| `email_invitado` | VARCHAR(255) | Email del destinatario |
| `invitado_por` | UUID FK → auth.users | Admin que realiza la invitación |
| `estado` | VARCHAR(20) | pendiente / aceptada / rechazada / expirada / cancelada |
| `fecha_expiracion` | TIMESTAMPTZ | NOW() + 7 días |
| `created_at` | TIMESTAMPTZ | Timestamp de creación (usado para rate limiting) |

#### `grupo_gastos`
Gastos registrados dentro de un grupo. Desde la migración `20260515_cuotas_grupales.sql` soporta compras en cuotas con tarjeta.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT PK | Generado automáticamente |
| `grupo_id` | BIGINT FK → grupos_gastos CASCADE | Grupo del gasto |
| `descripcion` | TEXT NOT NULL | Descripción en MAYÚSCULAS |
| `monto` | DECIMAL(12,2) CHECK > 0 | Monto total o de la cuota |
| `pagado_por` | UUID FK → auth.users RESTRICT | Quien pagó |
| `fecha` | TIMESTAMPTZ | Fecha del gasto o de la cuota |
| `nota` | TEXT | Nota opcional |
| `id_categoria` | BIGINT FK → categorias | Categoría (nullable) |
| `estado` | VARCHAR(20) | activo / anulado |
| `creado_por` | UUID FK | Quien registró el gasto |
| `cuotas` | SMALLINT (1-18) DEFAULT 1 | Cantidad total de cuotas |
| `numero_cuota` | SMALLINT DEFAULT 1 | Número de cuota actual |
| `id_gasto_padre` | BIGINT FK → grupo_gastos CASCADE | Vincula cuotas al gasto raíz |
| `metodo_pago` | VARCHAR(60) | 'TARJETA DE CREDITO' para compras en cuotas |
| `anulado_en` | TIMESTAMPTZ | Timestamp de anulación |
| `anulado_por` | UUID FK | Quien anuló el gasto |

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
| `id` | UUID PK | Token único |
| `grupo_id` | BIGINT FK → grupos_gastos | Grupo de la liquidación |
| `de_user_id` | UUID | Quien paga la deuda |
| `para_user_id` | UUID | Quien cobra |
| `monto` | DECIMAL(12,2) | Monto de la liquidación |
| `fecha` | DATE | Fecha del pago |
| `nota` | TEXT | Nota opcional |
| `estado` | VARCHAR(20) | confirmada / anulada |
| `registrado_por` | UUID FK | Quien registró la liquidación |
| `anulada_en` | TIMESTAMPTZ | Timestamp de anulación |
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
-- vw_grupo_saldos (rediseñada en migración 20260515_cuotas_grupales.sql)
-- Solo incluye cuotas grupales cuya fecha <= fecha actual (timezone Argentina).
-- Las cuotas futuras no afectan el saldo hasta que vencen.
-- saldo_neto > 0: te deben  |  saldo_neto < 0: debés
--
-- Fórmula:
-- saldo_neto = pagado + liquidado_enviado - asignado - liquidado_recibido
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
| `idx_grupo_gastos_gasto_padre` | grupo_gastos | id_gasto_padre WHERE id_gasto_padre IS NOT NULL |
| `idx_notificaciones_leida` | notificaciones | (user_id, leida) |

---

## 5. API y Endpoints

### Middlewares globales

| Middleware | Descripción |
|-----------|-------------|
| **helmet** | Headers de seguridad HTTP (CSP, HSTS, etc.). CSP permite conexiones a Supabase y Google. |
| **compression** | Compresión gzip de las respuestas. |
| **CORS** | Origen explícito desde `FRONTEND_URL`. En producción es obligatorio. En desarrollo acepta `http://localhost:5173`. |
| **express.json({ limit: '10kb' })** | Límite estricto de payload para prevenir abusos. |
| **validateApiKey** | Verifica el header `x-api-key` contra `N8N_API_KEY`. Aplica solo a los endpoints de integración. Siempre obligatoria. |
| **requireAuth** (grupos/notificaciones) | Extrae el JWT del header `Authorization: Bearer <token>`, lo valida con Supabase service role y adjunta `req.user`. |

### Rate Limiting

| Scope | Ventana | Máximo |
|-------|---------|--------|
| Global (todas las rutas) | 15 minutos | 300 requests/IP |
| `/api/notifications/*` | 1 minuto | 10 requests/IP |
| `/api/integrations/*` | 1 minuto | 30 requests/IP |
| `/api/grupos/*` | 1 minuto | 60 requests/IP |
| Invitaciones a grupos (in-DB) | 1 hora | 10 invitaciones/grupo |

El rate limit de invitaciones se valida consultando la tabla `grupo_invitaciones` en Supabase (durable frente a reinicios del servidor).

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

| Método | Path | Descripción | Permiso requerido |
|--------|------|-------------|-------------------|
| `POST` | `/api/grupos/:grupoId/invitaciones` | Invitar un miembro por email | Admin del grupo |
| `POST` | `/api/grupos/:grupoId/invitaciones/registro` | Email para registrar usuario nuevo | Admin del grupo |
| `POST` | `/api/grupos/invitaciones/aceptar` | Aceptar invitación con token UUID | Email del JWT debe coincidir con email_invitado |
| `GET` | `/api/grupos/:grupoId/usuarios/buscar?email=...` | Buscar usuario por email | Admin del grupo |
| `GET` | `/api/grupos/:grupoId/miembros/perfiles` | Obtener nombres de miembros activos | Miembro activo |
| `DELETE` | `/api/grupos/:grupoId` | Eliminar grupo (requiere saldos en cero) | Admin del grupo |
| `POST` | `/api/grupos/:grupoId/gastos` | Crear gasto grupal con participantes | Miembro activo |
| `PUT` | `/api/grupos/:grupoId/gastos/:gastoId` | Editar gasto grupal y recalcular división | Quien pagó |
| `PATCH` | `/api/grupos/:grupoId/gastos/:gastoId/anular` | Anular gasto grupal | Quien pagó |
| `PATCH` | `/api/grupos/:grupoId/gastos/:gastoId/anular-cuotas` | Anular todas las cuotas de una compra grupal | Quien pagó |
| `POST` | `/api/grupos/:grupoId/gastos-cuotas` | Crear gasto grupal en cuotas con tarjeta | Miembro activo |
| `POST` | `/api/grupos/:grupoId/liquidaciones` | Registrar liquidación entre miembros | El propio deudor |
| `PATCH` | `/api/grupos/:grupoId/liquidaciones/:liqId/anular` | Anular liquidación | Registrador o admin |

**Notas sobre validaciones de ruta:**
- `grupoId` debe ser un entero positivo (validado por `router.param`)
- `gastoId` debe ser un entero positivo (validado por `router.param`)
- `liqId` debe ser un UUID válido (validado por `router.param`)

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
7. Si hay un pending_invitation_token en sessionStorage → redirige al flujo de invitación
8. setUser(session.user) → la app accede a las rutas privadas
```

**Nota:** `AuthContext` usa `onAuthStateChange` como fuente de verdad para el estado de autenticación. El evento `INITIAL_SESSION` es el que dispara `setLoading(false)`, evitando el race condition donde `getSession()` resuelve con `null` antes de que el SDK intercambie el code OAuth.

### Flujo de logout

```
1. signOut() llama a supabase.auth.signOut({ scope: 'global' })
2. Invalida todos los tokens del usuario en todos los dispositivos
3. setUser(null) → ProtectedRoute redirige a /welcome
```

### Cliente Supabase admin (`server/services/supabaseAdmin.js`)

El backend usa un cliente separado (`supabaseAdmin`) configurado con la **service role key**. Este cliente bypasea todas las políticas RLS y tiene acceso completo a la base de datos, incluyendo la API de administración de usuarios (`auth.admin.*`).

El cliente se inicializa de forma **lazy** mediante un `Proxy`: la primera vez que se accede a cualquier propiedad se crea la instancia de `createClient`. Esto garantiza que `dotenv` ya cargó las variables de entorno antes de que el cliente las lea.

**Regla crítica:** Este cliente solo debe usarse en el backend. Nunca debe exponerse al frontend ni usarse para queries de datos de usuarios.

La variable de entorno que utiliza es `SUPABASE_SERVICE_ROLE_KEY` (no `SUPABASE_KEY`).

### Uso de claves

| Clave | Dónde se usa | Alcance |
|-------|-------------|---------|
| `VITE_SUPABASE_ANON_KEY` | Frontend (bundle público) | Solo lee/escribe según RLS del usuario autenticado |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend Express únicamente | Acceso completo sin RLS — nunca en frontend |

### Row Level Security (RLS)

Cada tabla tiene RLS habilitado. Las políticas garantizan que:
- Un usuario **solo puede ver y modificar sus propios datos**
- El anon key del frontend no puede acceder a datos de otros usuarios aunque se intercepte
- Las operaciones de grupos usan funciones `SECURITY DEFINER` para evitar recursión en las políticas

### Idempotencia — huella digital (n8n)

Antes de insertar un gasto desde n8n, el backend genera un hash SHA-256 de los datos del gasto:

```
fingerprint = SHA256(user_id | descripcion | monto | categoria | medioPago | fecha)
```

Este hash se guarda en la columna `huella_digital`. Si ya existe un registro con ese hash, el gasto no se inserta y se retorna `duplicated: true`. Esto previene registros dobles por reenvíos de WhatsApp.

Los helpers `normalizeAmount` y `generateFingerprint` están en `server/utils.js` y **nunca deben eliminarse**.

### Headers de seguridad (helmet)

El servidor aplica headers de seguridad HTTP via `helmet`, con una Content Security Policy que:
- Restringe las conexiones a Supabase y WebSockets de Supabase
- Permite Google OAuth (`frameSrc: accounts.google.com`)
- Permite Service Workers (`workerSrc: blob:`)

---

## 7. Módulos Funcionales

### 7.1 Dashboard

**Descripción funcional:** Pantalla principal. Muestra el resumen financiero del mes actual (ingresos, saldo disponible, total de gastos fijos y variables). Permite registrar nuevos gastos y actualizar el ingreso mensual.

**Reglas de negocio:**
- Gastos del mes: filtra por el rango del mes actual en zona Argentina (UTC-3)
- Saldo disponible = ingreso mensual total del mes − total gastos
- Ahorro estimado = referencia visual basada en el objetivo de ahorro configurado
- Descripción del gasto → MAYÚSCULAS antes de guardar
- Gastos con tarjeta de crédito → se generan N registros (cuotas) usando `cuotasHelper.js`

**Páginas y componentes:** `Dashboard.jsx`, `SummaryCard`, `DashboardTable`, `DashboardSkeleton`, `TarjetasCuotasCard`, `Modal`, `ConfirmModal`, `CurrencyInput`

**Funciones de db.js:** `getStats()`, `createExpense()`, `deleteVariableExpenses()`, `getCategories()`, `getPaymentMethods()`, `saveIncome()`, `getTarjetasEnCuotas()`, `getPrestamosEnCuotas()`

---

### 7.2 Movimientos

**Descripción funcional:** Historial completo de gastos. Permite buscar por descripción, filtrar por categoría, editar gastos individuales y eliminarlos. Muestra también los movimientos futuros (cuotas pendientes de tarjeta de crédito y préstamos).

**Reglas de negocio:**
- Solo se pueden eliminar gastos variables (`es_fijo = false`)
- La eliminación requiere confirmación vía `ConfirmModal`
- La edición no permite cambiar el tipo fijo/variable de cuotas
- Los gastos futuros son cuotas de tarjeta a partir del mes siguiente

**Páginas y componentes:** `Movements.jsx`, `Modal`, `ConfirmModal`, `CurrencyInput`, `GlassCard`

**Funciones de db.js:** `getExpenses()`, `updateExpense()`, `deleteExpense()`, `getGastosFuturos()`, `getPrestamosGastosFuturos()`, `deleteExpenseGroup()`, `updateExpenseGroup()`, `getCategories()`, `getPaymentMethods()`

---

### 7.3 Tarjeta de Crédito y Préstamos en Cuotas

**Descripción funcional:** Al registrar un gasto con tarjeta de crédito o como préstamo, la app genera automáticamente N registros de cuota, cada uno con fecha en meses consecutivos a partir del mes indicado por el usuario.

**Reglas de negocio:**
- El monto de cada cuota = monto_total / N (redondeado a centavos)
- La diferencia de redondeo va a la primera cuota
- Las cuotas de tarjeta son gastos fijos (`es_fijo = true`)
- Las cuotas se vinculan entre sí por `id_gasto_padre` (la primera cuota apunta a sí misma)
- El panel `TarjetasCuotasCard` muestra el estado de cada compra (pagadas vs. pendientes)
- La primera cuota vence en el mes elegido por el usuario (no necesariamente el siguiente)

**Helpers de cálculo:**
- `cuotasHelper.js` → `calcularCuotas(monto, cantCuotas, fechaPrimeraCuota, descripcion)`: devuelve array de `{ numero, monto, fecha, descripcion }` sin efectos secundarios.
- `cuotasGroupHelper.js` → `agruparPorPadre`, `filtrarTarjetaCredito`, `filtrarPrestamos`, `transformarGrupoCuotas`, `transformarGrupoCuotasFuturas`: funciones puras para agrupar y procesar filas de cuotas.

**Funciones de db.js:** `createExpense()` (con `esTarjetaCredito: true` o `esPrestamo: true`), `getTarjetasEnCuotas()`, `getPrestamosEnCuotas()`, `getGastosFuturos()`, `getPrestamosGastosFuturos()`, `deleteExpenseGroup()`, `updateExpenseGroup()`

---

### 7.4 Reportes

**Descripción funcional:** Análisis de gastos por rango de fechas configurable. Muestra totales, desglose por categoría con porcentaje, desglose por método de pago y evolución diaria del gasto.

**Páginas y componentes:** `Reportes.jsx`, `GlassCard`

**Funciones de db.js:**
- `getGastosByRango(desde, hasta)`: obtiene gastos de un rango de fechas arbitrario. Valida formato `YYYY-MM-DD`. Corrige el desfase UTC para que `hasta` sea inclusivo.
- `getReporteByRango(desde, hasta)`: calcula estadísticas completas incluyendo `totalGastos`, `gastosFijos`, `gastosVariables`, `ingresoMensual`, `porCategoria` (con porcentaje), `porMetodoPago`, `porDia`.
- `getStatsByMonth(year, month)`: estadísticas de gastos para un mes/año específico. Usado internamente por alertas y comparaciones mensuales.

---

### 7.5 Ingresos

**Descripción funcional:** El usuario registra sus ingresos con fecha. Puede haber múltiples ingresos por mes (a diferencia de versiones anteriores con un único registro mensual). Los ingresos son la base para calcular el saldo disponible y las alertas financieras.

**Reglas de negocio:**
- No se pueden registrar ingresos en meses anteriores al actual
- Los ingresos se suman para obtener el total mensual

**Ingresos recurrentes:** Plantillas que se esperan mensualmente. Al desactivar un recurrente con historial, se desactiva (no se elimina) para preservar el historial.

**Funciones de db.js:**
- `getIncomesByMonth(year, month)`, `getIncomeTotalByMonth(year, month)`: ingresos del período
- `createIncome({ monto, fecha, descripcion, categoria_id })`, `updateIncome(id, data)`, `deleteIncome(id)`: CRUD de ingresos
- `getIncomeCategories()`: categorías de ingresos
- `getRecurringIncomes()`: ingresos recurrentes configurados
- `createRecurringIncome(data)`, `updateRecurringIncome(id, data)`, `deleteRecurringIncome(id)`: CRUD de recurrentes
- `getProjectedIncomeByMonth(year, month)`: proyecta ingresos esperados según recurrentes activos
- `getMonthlyComparison(year, month)`: compara ingresos y gastos variables del mes actual vs. el anterior

**Alias de compatibilidad:** `getIncome()` y `saveIncome(monto)` se mantienen para compatibilidad con código existente.

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
- `grupos` — actividad en grupos compartidos (siempre envía email si hay SMTP)
- `alertas_financieras` — saldo bajo, gasto alto, concentración por categoría, gastos fijos
- `proyeccion` — alertas de proyección de saldo negativo y ahorro en riesgo
- `resumen` / `sistema` — resúmenes periódicos y mensajes del sistema

**Reglas de negocio:**
- Las notificaciones de grupos (`origen = 'grupos'`) siempre se envían por email si hay SMTP configurado, independientemente de la configuración del usuario
- El envío de email es fire-and-forget: nunca interrumpe el flujo principal
- Límite: últimas 50 notificaciones por usuario
- Las alertas financieras tienen throttle de 1 por tipo por día (localStorage por dispositivo)

**Contexto:** `NotificacionesContext.jsx` expone `notificaciones`, `noLeidas`, `config`, `panelAbierto`, `agregarNotificacion`, `leerNotificacion`, `leerTodas`, `guardarConfig`, y las funciones de alertas: `verificarAlertasFinancieras`, `verificarAlertaGastoAlto`, `verificarAlertasGastosFijos`, `verificarAlertaConcentracionCategoria`, `verificarProyecciones`, `generarResumenDiario`, `generarResumenSemanal`, `generarResumenMensual`.

**Funciones de db.js:** `getNotificaciones()`, `createNotificacion()`, `marcarLeida(id)`, `marcarTodasLeidas()`, `actualizarEstadoEmail(id, enviado, error)`, `getConfigNotificaciones()`, `saveConfigNotificaciones(config)`

---

### 7.8 Grupos de Gastos Compartidos

**Descripción funcional:** Permite crear grupos de personas para dividir gastos. Un admin invita miembros por email, registra gastos con participantes, y la app calcula automáticamente los saldos y sugiere cómo liquidar las deudas con el mínimo de transferencias.

**Reglas de negocio:**
- Al crear un grupo, el creador queda automáticamente como admin (trigger)
- La división de gastos es siempre igualitaria entre los participantes seleccionados
- La diferencia de centavos por redondeo va al pagador (o al primer participante)
- Solo quien pagó puede editar o anular un gasto grupal
- Solo admins pueden eliminar el grupo (y solo si todos los saldos son cero)
- Las invitaciones expiran a los 7 días
- Máximo 10 invitaciones por grupo por hora (rate limiting en DB, durable frente a reinicios)
- El grupo puede archivarse (soft delete) sin eliminar los datos históricos
- Grupos archivados no aceptan nuevas invitaciones

**Cuotas grupales (migración 20260515):** Se pueden registrar compras grupales en cuotas (1-18 cuotas). Cada cuota genera una fila en `grupo_gastos` vinculada por `id_gasto_padre`. La vista `vw_grupo_saldos` solo cuenta cuotas cuya fecha ya venció.

**Fórmula de saldo neto:**
```
saldo_neto = pagado + liquidado_enviado − asignado − liquidado_recibido
```
- Positivo: te deben dinero
- Negativo: debés dinero

**Algoritmo de transferencias mínimas (`grupos/saldos.js`):** Algoritmo greedy que empareja el deudor más grande con el acreedor más grande en cada iteración. Complejidad O(N log N). Garantiza el mínimo número de transferencias (máximo N-1 para N miembros).

**Páginas:** `Grupos.jsx`, `GrupoDetalle.jsx`, `GrupoSaldos.jsx`, `GrupoNuevo.jsx`, `GrupoGastoNuevo.jsx`, `GrupoGastoEditar.jsx`, `AceptarInvitacion.jsx`

**Helpers:**
- `cuotasGroupHelper.js`: funciones puras para agrupar y procesar cuotas grupales
- `grupos/saldos.js`: `calcularTransferencias(saldos)` — algoritmo de liquidación mínima

**Funciones de db.js:** `crearGrupo()`, `actualizarGrupo()`, `archivarGrupo()`, `eliminarGrupo()`, `obtenerGruposDelUsuario()`, `obtenerGrupoPorId()`, `obtenerMiembrosDelGrupo()`, `cambiarRolMiembro()`, `removerMiembro()`, `salirDelGrupo()`, `obtenerInvitacionesPendientes()`, `obtenerInvitacionesParaMi()`, `cancelarInvitacion()`, `crearGastoGrupal()`, `crearGastoGrupalEnCuotas()`, `obtenerCuotasGrupal()`, `obtenerGastosDelGrupo()`, `obtenerGastoConParticipantes()`, `anularGastoGrupal()`, `anularCuotasGrupales()`, `actualizarGastoGrupal()`, `registrarLiquidacion()`, `obtenerLiquidacionesDelGrupo()`, `anularLiquidacion()`, `obtenerSaldosDelGrupo()`

---

### 7.9 Configuración

**Descripción funcional:** Pantalla de preferencias del usuario. Permite gestionar categorías personales, configurar el tema visual (claro/oscuro y variantes de color), configurar el perfil de notificaciones (qué alertas recibir, umbrales), y habilitar o deshabilitar el envío de emails por tipo de evento.

**Gestión de perfil:** Nombre visible y datos de cuenta (solo lectura, proviene de Google OAuth).

**Preferencias de notificaciones:** Configura los umbrales de `configuracion_notificaciones` y cuáles notificaciones se envían por email.

**Páginas y componentes:** `Configuracion.jsx`, `GlassCard`

**Funciones de db.js:** `getCategories()`, `createCategory()`, `deleteCategory()`, `getConfigNotificaciones()`, `saveConfigNotificaciones()`, `getPerfilUsuario()`, `updateThemeUsuario()`

---

### 7.10 Contextos de React

| Contexto | Responsabilidad |
|----------|----------------|
| `AuthContext` | Sesión de usuario, login con Google OAuth, logout global. Expone `user`, `session`, `loading`, `signInWithGoogle`, `signOut`. Maneja redirección automática a invitaciones pendientes al hacer login. |
| `NotificacionesContext` | Estado de notificaciones, configuración de alertas, lógica de alertas financieras (5 fases), generación de resúmenes, envío de emails al backend. |
| `ThemeContext` | Tema visual activo (ID + modo). Se sincroniza desde Supabase al hacer login. Usa localStorage como fallback para evitar flash visual en el primer render. Expone `themeId`, `currentTheme`, `applyTheme`, `themes`. |
| `AppReadyContext` | Controla un flag `appReady` que los componentes de carga usan para sincronizar el loader inicial. Expone `appReady` y `setAppReady`. |

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
5. Genera fingerprint = SHA256(user_id|datos) → busca en gastos.huella_digital
6. Si existe → retorna duplicado (ok: true, duplicated: true)
7. Si no existe → inserta el gasto en Supabase (con service role)
8. Dispara notificación in-app (fire-and-forget)
9. Si emailUsuario configurado → envía email de confirmación
```

**Campos que acepta el monto:** número, string con punto (`"850.50"`) o con coma (`"850,50"`). La función `normalizeAmount` en `server/utils.js` normaliza la coma a punto y elimina puntos usados como separadores de miles (formato AR: `1.500,50`).

---

### Email (SMTP via nodemailer)

El servidor envía emails de notificación cuando el usuario tiene SMTP configurado.

**Implementación:** `server/services/email.js` y `server/services/notificaciones.js`

**Configuración:** variables de entorno SMTP en `server/.env`

**Tipos de emails:**
- Confirmación de gasto registrado desde n8n
- Alerta de saldo bajo / gasto alto / gastos fijos / variables crecientes
- Resúmenes diarios/semanales/mensuales
- Notificaciones de actividad en grupos (siempre, sin importar config)
- Invitaciones a grupos (`enviarEmailInvitacionGrupo`)
- Invitaciones a registrarse en la app (`enviarEmailInvitacionRegistro`)

**Reglas de envío por origen:**

| Origen | Condición de envío |
|--------|-------------------|
| `n8n` / `whatsapp` | `email_habilitado` + `email_notificaciones_n8n` |
| `grupos` | Siempre (transaccional, no configurable) |
| `alertas_financieras` | `email_habilitado` + flag específico según tipo |
| `resumen` | `email_habilitado` + flag de resumen (diario/semanal/mensual) |
| `ingresos` | `email_habilitado` |
| `gastos`, `app`, `sistema` | No se envía por email |

Si SMTP no está configurado (`SMTP_HOST`, `SMTP_USER` y `SMTP_PASS` vacíos), el sistema sigue funcionando sin enviar emails (falla silenciosa).

---

## 9. Variables de Entorno

### Frontend (`client/.env`)

| Variable | Expuesta al browser | Requerida | Descripción |
|----------|-------------------|-----------|-------------|
| `VITE_SUPABASE_URL` | Sí (VITE_*) | Sí | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Sí (VITE_*) | Sí | Clave pública de Supabase (anon key) |
| `VITE_BACKEND_URL` | Sí (VITE_*) | No | URL del backend Express (en producción). En dev usa `http://localhost:3001` como fallback. |

> **Importante:** Las variables `VITE_*` quedan embebidas en el bundle JavaScript y son visibles para cualquier usuario. Nunca deben contener la service role key.

### Backend (`server/.env`)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `PORT` | No | Puerto del servidor (default: 3001) |
| `NODE_ENV` | No | `production` o `development`. Si no está seteado, se asume `development`. |
| `SUPABASE_URL` | Sí | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | **Service role key** — acceso completo sin RLS — nunca en frontend |
| `N8N_API_KEY` | Sí | Clave de autenticación para el endpoint n8n. Siempre requerida. |
| `FRONTEND_URL` | Sí (producción) | URL del frontend (para CORS y links en emails de invitación). En producción es obligatoria; el servidor no arranca sin ella. |
| `SMTP_HOST` | No | Servidor SMTP para envío de emails |
| `SMTP_PORT` | No | Puerto SMTP (default: 587) |
| `SMTP_SECURE` | No | `true` para SSL (puerto 465), `false` para STARTTLS |
| `SMTP_USER` | No | Usuario SMTP |
| `SMTP_PASS` | No | Contraseña SMTP |
| `SMTP_FROM_NAME` | No | Nombre del remitente (default: 'TusGastosApp') |
| `SMTP_FROM_EMAIL` | No | Email del remitente (default: SMTP_USER) |

---

## 10. Manual de Uso

### Requisitos previos

- Node.js 18+ instalado (el Dockerfile usa Node 20)
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
# Editar server/.env con PORT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_API_KEY, FRONTEND_URL
# Opcional: agregar variables SMTP_* para envío de emails
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
# Desarrollo
npm run dev                        # Cliente + servidor en paralelo
npm run client                     # Solo el cliente Vite
npm run server                     # Solo el servidor Express

# Calidad de código
npm --prefix client run lint       # Lint del código frontend
npm --prefix client run build      # Build de producción del frontend
npm --prefix server run dev        # Servidor con nodemon (recarga automática)

# Tests
npm --prefix client run test       # Ejecuta los tests del frontend con vitest (modo run)
npm --prefix client run test:watch # Tests del frontend en modo watch
```

### Ejecutar tests con vitest

```bash
# Tests del frontend (modo run — una sola ejecución)
npm --prefix client run test

# Tests del frontend en modo watch (vuelve a ejecutar al guardar)
npm --prefix client run test:watch

# Con cobertura (requiere @vitest/coverage-v8)
npx --prefix client vitest run --coverage
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

### Build y ejecución con Docker

```bash
# Construir la imagen (inyectar variables de build del frontend)
docker build \
  --build-arg VITE_SUPABASE_URL=<url> \
  --build-arg VITE_SUPABASE_ANON_KEY=<key> \
  -t tusgastosapp .

# Ejecutar el contenedor
docker run -p 3001:3001 \
  -e SUPABASE_URL=<url> \
  -e SUPABASE_SERVICE_ROLE_KEY=<key> \
  -e N8N_API_KEY=<key> \
  -e FRONTEND_URL=https://tudominio.com \
  -e NODE_ENV=production \
  tusgastosapp
```

El Dockerfile usa un **build multi-stage** con Node 20 Alpine:
- **Stage 1 (builder):** Instala dependencias del cliente e inyecta las variables `VITE_*` como build args para que queden embebidas en el bundle.
- **Stage 2 (production):** Instala solo dependencias del servidor (`--omit=dev`), copia el build del cliente a `server/public/`, y arranca con `node index.js`.

En producción, Express sirve los estáticos del frontend desde `server/public/` y el catch-all devuelve `index.html` para que React Router funcione.

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
| El servidor no arranca en producción | Verificar que `FRONTEND_URL` esté seteada; el servidor hace `process.exit(1)` si falta |
| Saldos grupales no se actualizan | Las cuotas futuras no afectan el saldo hasta que vence su fecha (comportamiento esperado de `vw_grupo_saldos`) |
