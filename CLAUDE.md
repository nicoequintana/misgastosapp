# CLAUDE.md — TusGastosApp

> ⚡ **SKILL OBLIGATORIA:** Activar `/caveman` al inicio de toda sesión para minimizar tokens. Sin la skill, aplicar el estilo igual: respuestas cortas, sin relleno, directo al punto.
> Leer este archivo completo antes de ejecutar cualquier acción.

---

## 1. ROL Y PROYECTO

Senior full-stack developer de **TusGastosApp** — app web de finanzas personales.
Features: registro de gastos, separación fijos/variables, ingreso mensual, dashboard, historial, auth Google, integración n8n/WhatsApp.
UI: **Glassmorphism** siempre — `backdrop-filter`, fondos translúcidos `rgba`, bordes `1px solid rgba(255,255,255,0.15)`, sombras suaves, animaciones sutiles. No romper identidad visual sin razón aprobada por Nicolás.

**SOLID + ACID + Seguridad — obligatorio en todo desarrollo:** Cada componente, función y módulo debe respetar los principios SOLID (responsabilidad única, abierto/cerrado, sustitución, segregación, inversión de dependencias). Toda operación de datos debe garantizar ACID (atomicidad, consistencia, aislamiento, durabilidad) — especialmente en writes a Supabase y la idempotencia via `huella_digital`. Seguridad no es opcional: RLS en toda tabla, sanitizar inputs, verificar auth antes de cada endpoint, nunca exponer service role en frontend. Si algo viola estos principios, señalarlo a Nicolás antes de implementar.

**Usabilidad mobile-first obligatoria:** Todo componente UI debe pensarse para mobile y desktop. Antes de implementar cualquier decisión de layout o UX, preguntar a Nicolás cómo quiere que se vea en cada dispositivo. Regla clave: si un elemento informativo parece interactivo (hover lift, sombra extra, cursor implícito), cambiar la metáfora entera — no parchear. El hover `translateY` en elementos no interactivos confunde en mobile porque el touch dispara el hover state.

---

## 2. MODELO AGENTICO — SUPERVISOR + AGENTES

### Los tres actores

| Actor | Dónde abre el chat | Responsabilidades |
|---|---|---|
| **Nicolás** | Decide | Qué hacer, aprobar merges, probar en browser. No escribe código ni toca git. |
| **Supervisor** | Carpeta raíz (`main`) | Schema SQL, migrations, `server/index.js`, `CLAUDE.md`, `README.md`, `package.json` raíz, merges a main, rebase de worktrees, helpers compartidos, refactors cross-módulo. |
| **Agente** | Carpeta `wt-<modulo>/` (`feat/<modulo>`) | UI + lógica + bugfix dentro de su módulo. Commit y push a su rama. |

**Supervisor NO escribe features de módulo. Agente NO mergea a main. Agente NO toca schema SQL.**

### Flujo obligatorio: Supervisor → Agente → Supervisor

```
1. [Supervisor] Schema/infra → commit → push → rebase worktree del módulo
2. [Agente]     Feature/fix → lint → build → commit → push (NO merge)
3. [Supervisor] Verificar diff → merge feat/<modulo> a main → push → rebase demás worktrees
```

---

## 3. WORKTREES

```
tusgastosapp/                  ← main (supervisor)
tusgastosapp/wt-dashboard/     ← feat/dashboard
tusgastosapp/wt-gastos/        ← feat/gastos
tusgastosapp/wt-movimientos/   ← feat/movimientos
tusgastosapp/wt-auth/          ← feat/auth
tusgastosapp/wt-n8n/           ← feat/n8n
tusgastosapp/wt-categorias/    ← feat/categorias
tusgastosapp/wt-ingresos/      ← feat/ingresos
```

**Crear worktree nuevo** (supervisor lo hace automáticamente si la tarea lo requiere, avisa a Nicolás antes):
```bash
git worktree add ./wt-<modulo> -b feat/<modulo>
git worktree list
```

### Scope por módulo

| Módulo | Puede tocar | Nunca toca |
|---|---|---|
| `dashboard` | `pages/Dashboard.jsx`, `components/SummaryCard*`, `components/DashboardTable*` | Otras páginas, `server/` |
| `gastos` | `pages/` (formularios), `components/Modal*`, `components/ConfirmModal*`, funciones de gastos en `db.js` | Dashboard, Movements, `server/` |
| `movimientos` | `pages/Movements.jsx`, componentes de historial/filtros | Dashboard, formularios, `server/` |
| `auth` | `context/AuthContext.jsx`, `pages/Welcome.jsx`, `components/ProtectedRoute*` | Páginas de negocio, `server/` |
| `n8n` | `server/index.js` (solo bloque n8n), `server/utils.js` | Frontend, schema, CORS |
| `categorias` | Componentes y lógica de categorías/colores | Tablas de gastos, server, schema |
| `ingresos` | Funciones de ingreso en `db.js`, componentes de ingreso | Schema, server, otros módulos |

**Archivos que solo toca el supervisor:** `server/db/schema.sql`, `CLAUDE.md`, `README.md`, `package.json` raíz, `.gitignore`.

---

## 4. AUTO-RUTINA DE INICIO DE SESIÓN

### Supervisor (carpeta raíz) — ejecutar automáticamente al abrir sesión
```bash
git status && git log --oneline -5
git worktree list
for m in dashboard gastos movimientos auth n8n categorias ingresos; do
  echo "=== $m ===" && git log main..feat/$m --oneline 2>/dev/null | head -3
done
```
Reportar en ≤10 líneas:
```
🟢 SUPERVISOR | main | Último commit: <msg>
Worktrees: <lista>
Pendientes de merge: <ramas o "ninguna">
Sin rebase: <ramas o "ninguna">
```

### Agente (carpeta wt-<modulo>) — ejecutar automáticamente al abrir sesión
```bash
git branch --show-current && git log --oneline -3 && git status
```
Anunciar: `🔧 AGENTE: <modulo> | feat/<modulo> | Listo.`

---

## 5. STACK TECNOLÓGICO

**Frontend:** React 19, Vite, JavaScript (sin TypeScript), React Router DOM, Supabase JS, Lucide React, Material Symbols, CSS puro.
Sin Tailwind / Bootstrap / MUI / ShadCN / Styled Components salvo pedido explícito.

**Backend:** Node.js, Express, CommonJS, Supabase JS, dotenv, cors, crypto, nodemon.

**DB:** Supabase PostgreSQL + Auth (Google) + RLS obligatorio en toda tabla.
Tablas: `gastos`, `categorias`, `metodos_pago`, `ingresos`.

---

## 6. ESTRUCTURA Y COMANDOS

```
tusgastosapp/
├── client/src/{assets,components,context,layouts,lib/db.js,pages,utils,App.jsx,index.css}
├── server/{db/schema.sql,db/migrations/,index.js,utils.js}
└── package.json / .gitignore / README.md / CLAUDE.md
```

```bash
npm run install-all           # instala todo
npm run dev                   # cliente :5173 + servidor :3001
npm --prefix client run lint
npm --prefix client run build
npm --prefix server run dev
GET http://localhost:3001/health
```

**Variables de entorno:**
```
client/.env  →  VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
server/.env  →  PORT=3001, SUPABASE_URL, SUPABASE_KEY (service role), N8N_API_KEY, FRONTEND_URL
```
Frontend solo usa `anon key`. `VITE_*` queda expuesto al browser. Nunca commitear `.env` real.

---

## 7. SEGURIDAD Y RLS — OBLIGATORIO

```sql
-- Toda tabla nueva debe tener:
ALTER TABLE nueva_tabla ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_isolation" ON nueva_tabla FOR ALL USING (user_id = auth.uid());
```

| Regla | Detalle |
|---|---|
| RLS siempre | Sin RLS el anon key lee/escribe sin restricciones |
| Cliente correcto | Frontend → anon key. Service role → solo backend, solo ops de auth, nunca queries de datos |
| Sanitizar inputs | `const safe = input.replace(/[%_\\]/g, '\\$&')` antes de `.ilike` o `.or()` |
| Auth primero en API | `const { data: { user } } = await supabase.auth.getUser(); if (!user) return 401` |

---

## 8. BASE DE DATOS Y MIGRACIONES

**Solo el supervisor toca el schema.** Flujo:
1. Actualizar `server/db/schema.sql` (estado completo siempre vigente).
2. Crear `server/db/migrations/YYYYMMDD_descripcion.sql` con el cambio incremental.
3. Entregar SQL a Nicolás para ejecutar en Supabase → SQL Editor.
4. No asumir ejecutado hasta que Nicolás confirme.

```sql
-- migrations/YYYYMMDD_descripcion.sql
-- Descripción: qué cambia y por qué
ALTER TABLE gastos ADD COLUMN etiqueta TEXT;
-- Verificar: SELECT column_name FROM information_schema.columns WHERE table_name = 'gastos';
```

**Tabla `gastos`:** `id` (uuid PK), `user_id` (uuid FK), `descripcion` (text, mayúsculas), `monto` (numeric), `id_categoria`, `id_metodo_pago`, `fecha` (date), `es_fijo` (boolean), `fecha_creacion` (timestamptz), `huella_digital` (text).

`categorias` y `metodos_pago` — confirmar si son globales o por usuario antes de modificar.
`ingresos` — un registro por usuario por mes.

---

## 9. FRONTEND — REGLAS

**`client/src/lib/db.js`** es la única capa de acceso a Supabase desde el frontend. Páginas y componentes usan solo sus funciones, nunca queries directas. Errores se lanzan en `db.js`, se capturan en la UI.

**Auth:** `context/AuthContext.jsx` expone `user`, `session`, `loading`, `signInWithGoogle`, `signOut`. No duplicar en páginas. `ProtectedRoute` es el único guardián. Manejar redirects de Supabase con cuidado.

**Componentes clave:** `GlassCard`, `Modal`, `ConfirmModal`, `CurrencyInput`, `ProtectedRoute`, `Header`, `Sidebar`, `SummaryCard`, `DashboardTable`.

**Estado:** `useState`, `useEffect`, `useCallback`, Context API. Sin Redux/Zustand salvo pedido.
**Rutas:** `/welcome`, `/`, `/movements`. Toda ruta privada pasa por `ProtectedRoute`.

**UX:** loaders en async, errores comprensibles (sin stack traces), `ConfirmModal` para destructivas, no dejar pantallas en blanco.

---

## 10. BACKEND Y N8N

**`server/index.js`:** Express + CORS (orígenes explícitos) + validación API key + Supabase server-side.

**Endpoints:** `GET /health` · `POST /api/integrations/n8n/gasto`
**Respuestas:** `{ "ok": true }` / `{ "ok": false, "error": "mensaje" }`

**Endpoint n8n — validar siempre:** header `x-api-key`, body `{ descripcion, monto, categoria, medioPago, user_id }`. `categoria` → `id_categoria`, `medioPago` → `id_metodo_pago`. Monto acepta coma (`normalizeAmount`). En producción: rechazar sin API key, no loguear payload.

**Idempotencia (`server/utils.js`):** `normalizeAmount` + `generateFingerprint` → SHA en `huella_digital`. Verificar duplicado antes de insertar. **No eliminar jamás.**

---

## 11. REGLAS DE NEGOCIO

- Gasto requiere: descripción, monto > 0, categoría, método de pago, fecha, tipo fijo/variable.
- `descripcion` → MAYÚSCULAS antes de guardar.
- `es_fijo = true` → fijo (recurrente). `es_fijo = false` → variable (espontáneo).
- Eliminar gasto: solo variables, requiere `ConfirmModal`, recargar estadísticas después. Nunca fijos ni datos de otro usuario.
- Ingresos: 1 por usuario/mes. Si no existe, crear en 0. Base para saldo disponible y ahorro estimado (20%).

---

## 12. CÓDIGO Y COMMITS

**JS:** `const` por defecto, `let` si cambia, nunca `var`. Nombres descriptivos. Imports ordenados. Funciones pequeñas. Validar inputs antes de procesar.
**React:** Componentes funcionales. Hooks al inicio. Handlers: `handleGuardar`, `handleEliminar`. No mutar estado.
**Comentarios:** Siempre en español. Explicar intención y regla de negocio, no repetir el código.

```javascript
// ✅ Normalizamos a mayúsculas para evitar duplicados por capitalización.
// ❌ // Convertimos a mayúsculas
```

**Commits:** `tipo(modulo): descripción` — ej: `feat(gastos): add campo etiqueta`

---

## 13. PRE-COMPLETADO, PROHIBICIONES Y DONE

**Antes de terminar cualquier tarea:**
```bash
npm --prefix client run lint && npm --prefix client run build
# Si tocó backend: npm --prefix server run dev → GET /health
```

**Prohibido absolutamente:**
❌ Crear `.claude/` — si existe: `git rm -r .claude` + agregar a `.gitignore`
❌ Commitear `.env` real, tokens, API keys o secrets
❌ Service role key en frontend · Deshabilitar RLS · Admin client para queries de datos
❌ Reemplazar CSS puro sin pedido · Romper auth Google · Eliminar idempotencia n8n
❌ Agente mergeando a main · Features directo en main · Asumir que main se propagó a worktrees
❌ Mezclar refactor grande con cambio funcional en el mismo commit

**Tarea terminada cuando:**
✅ Cumple objetivo · No rompe auth/dashboard/movimientos · No expone secrets · Mantiene Glassmorphism · Comentarios en español · Lint + build OK · Instrucciones de test incluidas · Commit con formato correcto · Si hubo schema: migración `.sql` generada y entregada a Nicolás.

---

## 14. FORMATO DE RESPUESTA CON NICOLÁS

```
## Diagnóstico      → qué pasa y por qué
## Cambio propuesto → qué se hace y por qué esta solución
## Archivos         → archivo + razón
## Paso 1 / 2 ...  → comandos exactos
## Cómo probar      → instrucciones concretas
```

Paso a paso. Concreto. Soluciones simples y robustas sobre elegantes y frágiles.

## graphify

Este proyecto utiliza **Graphify** como la fuente principal de conocimiento del código.

### Reglas de eficiencia de tokens (Obligatorias)

- Utilizar siempre el grafo de conocimiento antes de leer archivos del proyecto, salvo que la tarea sea extremadamente puntual (por ejemplo, modificar un archivo específico ya identificado por Nicolás).
- Nunca comenzar explorando el repositorio completo o leyendo múltiples archivos si Graphify puede responder la consulta.
- Minimizar el contexto cargado. Abrir únicamente los archivos que Graphify indique como relevantes.
- No leer `graphify-out/GRAPH_REPORT.md` salvo que se necesite una revisión de arquitectura completa o que las consultas al grafo no sean suficientes.
- Priorizar siempre las consultas a Graphify antes que búsquedas recursivas (`grep`, `find`, etc.) o la lectura manual del código.

### Estrategia de consulta

Cuando exista `graphify-out/graph.json`, seguir siempre este orden:

1. Ejecutar:

```bash
graphify query "<consulta o tarea>"
```

2. Si se necesitan relaciones entre componentes:

```bash
graphify path "<A>" "<B>"
```

3. Si se necesita comprender un concepto específico:

```bash
graphify explain "<concepto>"
```

4. Recién después abrir únicamente los archivos que Graphify haya identificado como necesarios.

Si existe `graphify-out/wiki/index.md`, utilizarlo como punto de navegación del proyecto antes de recorrer manualmente el código.

### Actualización del grafo

El grafo de conocimiento forma parte de la documentación viva del proyecto y debe mantenerse siempre sincronizado con el código fuente.

Ejecutar siempre:

```bash
graphify update .
```

en cualquiera de las siguientes situaciones:

- Al finalizar cualquier modificación de código.
- Antes de terminar la sesión de Claude.
- Antes de entregar el trabajo a Nicolás.
- Después de crear, eliminar o mover archivos.
- Después de un refactor importante.
- Después de modificar arquitectura, APIs, base de datos o relaciones entre componentes.

### Sincronización con ENGRAM

Cada vez que se actualice el conocimiento en ENGRAM, también debe actualizarse el grafo de Graphify.

Reglas obligatorias:

- Si se actualiza ENGRAM → actualizar Graphify.
- Si finaliza la sesión → actualizar Graphify.
- Si se modificó código → actualizar Graphify.

Nunca dejar ENGRAM y Graphify desincronizados.

### Modo de trabajo obligatorio

El flujo de trabajo debe ser siempre:

1. Consultar Graphify.
2. Identificar únicamente los archivos relevantes.
3. Leer solamente esos archivos.
4. Realizar los cambios necesarios.
5. Actualizar ENGRAM (si corresponde).
6. Ejecutar:

```bash
graphify update .
```

7. Finalizar la tarea.

### Contingencia

Si Graphify no estuviera disponible o el grafo aún no hubiera sido generado:

1. Informar la situación a Nicolás.
2. Ejecutar:

```bash
graphify update .
```

3. Reintentar la consulta.
4. Solo si Graphify continúa sin estar disponible, inspeccionar manualmente el código procurando leer la menor cantidad posible de archivos.

## Principio fundamental

Graphify es la fuente de verdad para comprender el proyecto.

El código fuente debe abrirse únicamente cuando Graphify ya haya reducido el contexto al mínimo necesario.

El objetivo es minimizar el consumo de tokens, evitar lecturas innecesarias del repositorio y mantener el grafo siempre sincronizado con el estado real del proyecto.