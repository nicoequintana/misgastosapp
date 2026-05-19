# TusGastosApp — Control Financiero Personal

Plataforma web para la gestión de finanzas personales, con diseño **Glassmorphism**, autenticación segura y soporte para gastos compartidos en grupo.

---

## Visión del Proyecto

TusGastosApp permite a cada usuario tener control total sobre sus flujos de caja mensuales: registrar gastos fijos y variables, seguir el avance contra su ingreso mensual, administrar compras en cuotas y préstamos, y colaborar con otras personas en gastos compartidos.

---

## Stack Tecnológico

### Frontend

| Tecnología | Rol |
|---|---|
| React 19 | Framework de UI |
| Vite | Bundler y dev server |
| JavaScript (sin TypeScript) | Lenguaje principal |
| React Router DOM | Enrutamiento SPA |
| Supabase JS | Cliente de base de datos y auth |
| Lucide React + Material Symbols | Iconografía vectorial |
| CSS puro (variables CSS, Flexbox, Grid) | Estilos — sin Tailwind, Bootstrap ni MUI |

### Backend

| Tecnología | Rol |
|---|---|
| Node.js + Express | API REST |
| Supabase JS (service role) | Operaciones servidor-a-servidor |
| Helmet | Headers de seguridad HTTP |
| express-rate-limit | Rate limiting por IP |
| dotenv | Gestión de variables de entorno |
| nodemon | Hot reload en desarrollo |

### Base de Datos e Infraestructura

| Tecnología | Rol |
|---|---|
| Supabase PostgreSQL | Base de datos principal |
| Supabase Auth | Autenticación (Google OAuth + email/password) |
| Row Level Security (RLS) | Aislamiento de datos por usuario — obligatorio en todas las tablas |

---

## Arquitectura

```
tusgastosapp/
├── client/                        # Frontend React + Vite
│   └── src/
│       ├── assets/                # Recursos estáticos
│       ├── components/            # Componentes reutilizables
│       │   ├── dashboard/         # SummaryCard, DashboardTable, TarjetasCuotasCard, PrestamosCard
│       │   └── grupos/            # GrupoCard, GrupoTabs, SaldoTable, TransferenciasSugeridas, ...
│       ├── context/               # AuthContext, ThemeContext, NotificacionesContext, AppReadyContext
│       ├── layouts/               # MainLayout (Sidebar + Header + Outlet)
│       ├── lib/
│       │   ├── db.js              # Data Access Layer — única capa que toca Supabase desde el frontend
│       │   ├── supabase.js        # Instancia del cliente Supabase
│       │   ├── cuotasHelper.js    # Lógica pura de cálculo de cuotas
│       │   ├── cuotasGroupHelper.js # Agrupación y filtrado de cuotas
│       │   └── grupos/saldos.js   # Algoritmo de cálculo de saldos entre miembros
│       ├── pages/                 # Páginas principales
│       │   └── grupos/            # Páginas del módulo de grupos compartidos
│       ├── utils/
│       │   ├── format.js          # Formateo de moneda, fechas, etc.
│       │   └── seo.js             # Helpers de meta tags
│       └── __tests__/             # Tests unitarios (Vitest)
│
└── server/                        # Backend Express
    ├── index.js                   # Entry point — configuración de middleware y rutas
    ├── utils.js                   # normalizeAmount, generateFingerprint
    ├── routes/
    │   ├── notificaciones.js      # Endpoints de notificaciones y email
    │   └── grupos.js              # Endpoints de grupos compartidos
    ├── services/
    │   ├── notificaciones.js      # Lógica de envío de emails y alertas
    │   └── notificacionesDb.js    # Persistencia de notificaciones
    └── db/
        └── migrations/            # Migraciones SQL incrementales
```

### Modelo de datos principal

| Tabla | Descripción |
|---|---|
| `gastos` | Gastos personales del usuario (incluye cuotas como filas separadas) |
| `categorias` | Categorías de gasto por usuario |
| `metodos_pago` | Métodos de pago por usuario |
| `ingresos` | Un registro por usuario/mes — base del saldo disponible |
| `perfiles_usuario` | Preferencias del usuario (tema, configuración de notificaciones) |
| `grupos` | Grupos de gastos compartidos |
| `grupo_miembros` | Miembros de cada grupo con su rol |
| `grupo_gastos` | Gastos registrados dentro de un grupo |
| `grupo_invitaciones` | Invitaciones por token para unirse a un grupo |
| `notificaciones` | Historial de notificaciones del usuario |

---

## Funcionalidades

### Dashboard

Vista principal con resumen financiero del mes en curso:

- **4 tarjetas de resumen:** Ingresos mensuales, Gasto total, Saldo disponible, Ahorro estimado (20% del ingreso).
- **Tabla de gastos variables** del mes con acción de eliminación individual.
- **Tabla de gastos fijos** del mes (solo lectura).
- **Tarjeta de tarjetas en cuotas:** vista consolidada de todas las cuotas activas del mes y futuras.
- **Tarjeta de préstamos:** cuotas de préstamos activos con proyección de meses restantes.
- **Registro de nuevo gasto** mediante modal con validaciones completas.
- **Edición de ingreso mensual** directamente desde el dashboard.
- **Reset de gastos variables** del mes (con confirmación).

### Registro de Gastos

Formulario con los campos:

- Descripción (se normaliza a MAYÚSCULAS antes de guardar)
- Monto (acepta punto y coma como separador decimal)
- Categoría (seleccionable de las categorías del usuario)
- Método de pago
- Fecha
- Tipo: **Fijo** (recurrente mensual) o **Variable** (espontáneo)
- **Compra con tarjeta de crédito en cuotas:** hasta 18 cuotas con fecha de primera cuota configurable. Cada cuota se guarda como una fila separada en la tabla `gastos`, apareciendo solo en el mes que le corresponde.
- **Préstamo:** cuotas de préstamo con el mismo mecanismo.

### Historial de Movimientos

Página `/movimientos` con:

- Listado completo de gastos de todos los meses, con filtros por período.
- Búsqueda por descripción, categoría y método de pago.
- Edición y eliminación de gastos (solo variables).

### Reportes

Página `/reportes` con análisis por período configurable:

- Períodos predefinidos: este mes, mes anterior, últimos 3 meses, últimos 6 meses, este año.
- Rango personalizado por fechas.
- Desglose por categoría con totales y porcentajes.
- Vista de cuotas activas agrupadas.

### Grupos de Gastos Compartidos

Módulo completo en `/grupos` para administrar gastos entre varias personas:

- **Crear grupos** con nombre y descripción.
- **Invitar miembros** por email mediante un token de invitación único.
- **Aceptar invitaciones** desde un link (ruta pública `/grupos/invitaciones/:token`).
- **Registrar gastos grupales** con soporte para cuotas.
- **Tab Resumen:** totales del grupo y estado de saldos.
- **Tab Gastos:** listado de gastos del grupo con edición y eliminación.
- **Tab Miembros:** lista de miembros activos e invitaciones pendientes.
- **Tab Saldos:** cálculo automático de quién le debe cuánto a quién, con el algoritmo de mínimas transferencias. Muestra las transferencias sugeridas para saldar todas las deudas con el menor número de movimientos posible.

### Notificaciones

Sistema de alertas financieras configurable:

- **Alertas automáticas** al registrar gastos: saldo bajo, gasto individual alto, porcentaje del ingreso superado.
- **Panel de notificaciones** en el header con contador de no leídas.
- **Historial** con marcado como leída individual y masivo.
- **Configuración de umbrales** desde la página de Configuración: umbral de saldo bajo (monto), umbral de gasto alto (monto), porcentaje máximo del ingreso.
- **Notificaciones por email** opcionales para resumen diario, semanal y mensual.

### Configuración de Usuario

Página `/configuracion` con:

- Información de perfil (nombre, avatar de Google si aplica).
- **Selector de tema visual:** 18 temas disponibles — 9 claros (Azure, Sage, Rose, Violet, Amber, Slate, Coral, Mint, Peach) y 9 oscuros (Ocean, Aurora, Crimson, Amethyst, Gold, Carbon, Neon, Volcanic, Midnight). El tema se sincroniza con Supabase y persiste entre dispositivos.
- **Gestión de categorías personales:** agregar y eliminar categorías propias.
- **Preferencias de notificaciones:** activar/desactivar cada tipo de alerta y configurar umbrales.

### Autenticación

- **Google OAuth** mediante Supabase Auth.
- **Email / contraseña** con verificación de email.
- Rutas protegidas por `ProtectedRoute` — redirige a `/welcome` si no hay sesión.
- `AppLoader` con splash screen durante la resolución inicial de auth.

---

## Seguridad

La aplicación implementa múltiples capas de protección a nivel de base de datos, API y transporte. El acceso a los datos está restringido por usuario autenticado — ningún dato es accesible sin sesión válida. Las credenciales sensibles nunca se exponen al cliente.

---

## Instalación y Desarrollo

### Prerrequisitos

- Node.js 18 o superior
- Cuenta en [Supabase](https://supabase.com) con un proyecto creado

### Variables de entorno

**`client/.env`**
```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key
VITE_BACKEND_URL=http://localhost:3001
```

**`server/.env`**
```env
PORT=3001
SUPABASE_URL=tu_url_de_supabase
SUPABASE_KEY=tu_service_role_key
FRONTEND_URL=http://localhost:5173
```

> Nunca commitear archivos `.env` reales. Están incluidos en `.gitignore`.

### Comandos

```bash
# Instalar dependencias de cliente y servidor
npm run install-all

# Iniciar cliente (:5173) y servidor (:3001) en paralelo
npm run dev

# Solo cliente
npm --prefix client run dev

# Solo servidor
npm --prefix server run dev

# Lint del frontend
npm --prefix client run lint

# Build de producción del frontend
npm --prefix client run build

# Verificar salud del backend
curl http://localhost:3001/health
```

### Tests

```bash
# Ejecutar tests unitarios del frontend
npm --prefix client run test
```

Los tests cubren: cálculo de cuotas (`cuotasHelper`), agrupación de cuotas grupales (`cuotasGroupHelper`), cálculo de saldos entre miembros (`saldos`), proyección de ingresos, cálculo de reportes y formateo de moneda.

---

## Rutas

| Ruta | Acceso | Descripción |
|---|---|---|
| `/welcome` | Pública | Pantalla de login / registro |
| `/grupos/invitaciones/:token` | Pública | Aceptar invitación a un grupo |
| `/` | Privada | Dashboard principal |
| `/movimientos` | Privada | Historial de movimientos |
| `/reportes` | Privada | Análisis y reportes por período |
| `/configuracion` | Privada | Perfil, tema y notificaciones |
| `/grupos` | Privada | Lista de grupos compartidos |
| `/grupos/nuevo` | Privada | Crear nuevo grupo |
| `/grupos/:id` | Privada | Detalle del grupo (Resumen / Gastos / Miembros / Saldos) |
| `/grupos/:id/gastos/nuevo` | Privada | Registrar gasto en el grupo |
| `/grupos/:id/gastos/:gastoId/editar` | Privada | Editar gasto grupal |

---

## Autor

Nicolás Ezequiel Quintana
