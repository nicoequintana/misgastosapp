# mejoras.md — Análisis Exhaustivo de TusGastosApp

> Auditoría completa read-only. **No se modificó ningún archivo de código.** Fecha: 2026-07-20.
> Metodología: análisis estático manual + 7 agentes especializados en paralelo (5 judges de seguridad ciegos, 1 refactor/dead-code, 1 UX/UI) + suite de tests ejecutada + coverage + `npm audit`.
> Cada hallazgo cita evidencia `archivo:línea`. Prioridad: **P1** crítico · **P2** importante · **P3** pulido.
>
> **Actualización 2026-07-20 (sesión de implementación):** Sprints 1, 2 y 3 completados y verificados (tests + prueba manual en la app). Ver detalle abajo.

---

## Estado de implementación (post-auditoría)

### ✅ Sprint 1 — Seguridad y correctitud

S-01, S-02, S-03, `npm audit fix` (client+server), C-01 (createExpense atómico vía RPC). Todo probado end-to-end.

### ✅ Sprint 2 — UX crítico

UX-01 (focus-trap/ESC/ARIA en Modal), UX-02 (hover-lift solo en cards interactivas), UX-03 (touch targets ≥44px). Confirmado visualmente por Nicolás.

### ✅ Sprint 3 — Deuda técnica

- DC-01 (7 exports muertos en `db.js`), DC-02 (test deshabilitado) — hecho.
- **R4 — 2 hallazgos NUEVOS no documentados en el análisis original**, encontrados al revisar la duplicación de lógica de cuotas:
  - `POST /gastos-cuotas` (crear gasto grupal en cuotas) tenía el mismo bug de atomicidad que C-01 → resuelto con RPC `create_grupo_gasto_installments`.
  - `PUT /gastos/:gastoId` (editar gasto grupal en cuotas) tenía el mismo bug de atomicidad **más** un bug de producto: el formulario mostraba/editaba el monto de UNA cuota puntual (no el total) y no permitía cambiar la cantidad de cuotas; además duplicaba el sufijo `(N/total)` en la descripción en cada edición → resuelto con RPC `update_grupo_gasto_installments` v2 + fix de frontend. Probado con doble edición en la app real.
- R5 (regex/constantes duplicadas) — consolidado: `limpiarSufijoCuota()` en `cuotasGroupHelper.js` (reemplaza 4 copias del regex de sufijo) y `fechaHoyArgentina()` en `grupos.js` (reemplaza 3 copias del literal de timezone).

### ✅ Sprint 4 — Pulido

- **UX-04/05** — `htmlFor`/`id` en 22 pares label-input de Dashboard/Movements; `role="group"`+`aria-labelledby` en `ChipSelector` (prop `labelId` nueva); `role="alert"` en mensajes de error que no lo tenían.
- **UX-06** — tecla Space agregada junto a Enter en `NotificacionesPanel`/`GrupoCard` (antes solo Enter).
- **UX-07** — `@media (prefers-reduced-motion: reduce)` global.
- **UX-08** — `--text-muted` de los 9 temas oscuros translúcidos sube de 0.4-0.55 a 0.68 de opacidad.
- **UX-09** — `Configuracion.jsx` usa `ConfirmModal` en vez de confirm inline para eliminar categorías/métodos de pago.
- **UX-10** — `.form-label-box` unificada con `.form-label`; estilos inline `rgba(255,255,255,...)` de la lista de ingresos reemplazados por tokens de tema (`--input-bg`/`--input-border`/`--separator-color`).
- **UX-12** — no aplicaba: `.search-container` es CSS huérfano sin JSX asociado (la feature ya no existe).
- **UX-13** — salteado a pedido explícito: el scroll horizontal de esa tabla se sacó antes por decisión previa de Nicolás.
- **UX-14** — diferido a R6 (mismo código del wizard de Dashboard).
- **UX-15** — estados de error visibles + botón "Reintentar" en las cargas secundarias de `Movements.jsx` (futuros/préstamos futuros), que antes fallaban en silencio.
- **UX-16** — `GrupoCard`/`GrupoDetalle` usan `formatCurrency` en vez de `.toFixed(2)` sin separador de miles.
- **UX-17** — diferido a otra sesión (validación on-blur es cambio de UX no trivial en 3 formularios).
- **UX-18** — eliminado el listener global de `Enter` en `Dashboard.jsx` (redundante: los `<button>` HTML ya disparan `click` con Enter nativamente).
- **UX-19** — breadcrumb "Grupos / {título}" agregado en `GrupoGastoForm.jsx` (crear/editar gasto grupal).
- **R8** — 7 sub-componentes de `Reportes.jsx` movidos a `components/reportes/` (717→400 líneas).
- **R9** — magic numbers con nombre: `MAX_CUOTAS_PERSONAL`/`MAX_CUOTAS_GRUPAL`, `DURACION_BLOQUEO_PASO_MS`, `USUARIOS_POR_PAGINA`/`PAGINAS_MAX`.
- **R10** — `calcularAgregadosGastos()` reemplaza el cálculo total/fijos/variables triplicado en `getStats`/`getReporteByRango`/`getStatsByMonth`; exportada y testeada (5 tests nuevos).

Todo verificado: 234 tests client + 153 tests server, lint limpio, build OK.

### ✅ Cobertura de tests — `createExpense` (db.js)

5 tests nuevos en `client/src/lib/db.createExpense.test.js` ("SIN DESCRIPCIÓN" por defecto, `id_categoria`/`id_metodo_pago = 0` no colapsa a null en ambos caminos con/sin cuotas, manejo de `data null` sin error, propagación de error de Supabase). Cobertura de `db.js` sube de 8.79% a 16.26%. De paso se encontró y arregló C-02 (ver sección 1), que seguía vivo en el código pese a estar documentado como P3. 239/239 tests, lint y build OK.

### ✅ Cobertura de tests — grupos/liquidaciones (db.js)

19 tests nuevos en `client/src/lib/db.grupos.test.js` para `registrarLiquidacion`, `obtenerSaldosDelGrupo` y `crearGastoGrupalEnCuotas`, incluyendo la invariante de que el ledger siempre suma cero entre miembros. Cobertura de `db.js` sube de 16.26% a 19.70% (statements). 258/258 tests, lint y build OK.

**Dato de arquitectura descubierto** (no bug): `registrarLiquidacion` y `crearGastoGrupalEnCuotas` NO usan Supabase directo — delegan al backend vía `fetch` a `server/routes/grupos.js`, que es donde vive la validación y el fix de S-01. `obtenerSaldosDelGrupo` sí usa Supabase directo pero solo lee la vista `vw_grupo_saldos` (el cálculo de saldos vive en SQL, no en el cliente). No se verificó si esos endpoints del backend usan transacción SQL real — pendiente si se quiere auditar en profundidad.

### ✅ Cobertura de tests — `AuthContext.jsx`

14 tests nuevos en `client/src/context/AuthContext.test.jsx` (estado inicial, `onAuthStateChange` con `INITIAL_SESSION`/`SIGNED_IN`/`SIGNED_OUT`, `signOut` y `signInWithGoogle` con éxito/error, cleanup del listener al desmontar, redirección por invitación pendiente con token UUID válido/inválido/ausente). Cobertura sube de ~7% a **100% statements/lines/functions** (95.45% branches — única rama sin cubrir es un `console.log` de dev). Se confirmó que `signOut` ya usa `scope: 'global'` como exige CLAUDE.md — no había desvío. 272/272 tests, lint y build OK. Con esto, los 3 huecos grandes de cobertura documentados en la auditoría original (`createExpense`, grupos/liquidaciones, `AuthContext`) quedaron atendidos.

### ✅ R1 — split de `db.js` por dominio

`db.js` (2337 líneas) pasa a ser un barrel re-export de 28 líneas. Lógica movida a `client/src/lib/db/{expenses,categories,incomes,recurringIncomes,profile,stats,notifications,groups/*}.js`. Ningún consumidor externo tocado (imports de `../lib/db` siguen funcionando igual). Split incremental, tests corridos después de cada dominio movido. 272/272 tests, lint y build OK.

**Bug encontrado y arreglado de paso**: `eliminarGrupo()` (`db/groups/gastos.js`) hacía `fetch('/api/grupos/...')` sin `BACKEND_URL`, a diferencia de las otras 6 llamadas del mismo archivo — en producción con front/back en distinto origin, el borrado de grupo fallaba. Ya existía en el `db.js` original antes del refactor (no lo introdujo el split). Corregido en commit aparte.

**Duplicación preexistente detectada, no tocada** (fuera de scope de este refactor mecánico): `getTarjetasEnCuotas` y `getPrestamosEnCuotas` (`db/expenses.js`) hacen el mismo query a Supabase, solo difieren en el filtro post-fetch.

### ✅ R2 — split de `server/routes/grupos.js` por dominio

`grupos.js` (1464 líneas, 13 endpoints) pasa a ser un barrel de 4 líneas. Lógica movida a `server/routes/grupos/{_helpers,invitaciones,grupo,gastos,liquidaciones}.js` + `index.js` que combina los sub-routers. `server/index.js` no requirió ningún cambio.

**Detalle técnico manejado correctamente**: en Express, `router.param()` no se propaga desde un router padre a sub-routers montados con `router.use()` — cada sub-router que usa `:grupoId`/`:gastoId`/`:liqId` en sus rutas repite su propio `router.param()` con la validación idéntica al original (verificado línea por línea). 153/153 tests server, prueba de humo con servidor real levantado y `GET /health` → `{"status":"ok"}`.

### ✅ R6 — extraer wizards de Dashboard.jsx (incluye UX-14)

`Dashboard.jsx` (1324 líneas) baja a 474. Wizard de gasto extraído a `components/dashboard/GastoWizard.jsx` (441 líneas) y modal de ingresos (lista + wizard + `ConfirmModal` de eliminar) a `components/dashboard/IngresoModal.jsx` (526 líneas). Cada uno mantiene su propio estado local (form/paso/fase); Dashboard.jsx solo pasa catálogos ya cargados y reacciona a callbacks de guardado exitoso.

**UX-14 aplicado**: ambas fases de "resultado" ahora usan `ResultModal` con una prop nueva `bare` (default `false`, sin impacto en `Movements.jsx`/`Configuracion.jsx`) que renderiza solo el contenido sin su propio `<Modal>` — necesario porque el resultado se muestra como fase dentro de un modal-wizard ya abierto, y anidar dos `<Modal>` hubiera duplicado el overlay.

Toda la lógica de negocio (validaciones, manejo de tarjeta/préstamo, el mecanismo anti-flash del fade-out de 300ms) se preservó idéntica, verificada línea por línea contra el original. 2 archivos de test nuevos (`GastoWizard.test.jsx`, `IngresoModal.test.jsx`). 281/281 tests, lint y build OK. Probado manualmente en navegador por Nicolás: wizard de gasto e Ingresos funcionan correctamente.

### ✅ R7 — extraer motores de alerta de NotificacionesContext.jsx

`NotificacionesContext.jsx` (750 líneas) baja a 463. Los 8 motores de alerta se separan en lógica pura (`client/src/lib/alertas/{alertasFinancieras,alertaGastoAlto,alertasGastosFijos,alertaConcentracionCategoria,proyecciones,resumenDiario,resumenSemanal,resumenMensual}.js` + `index.js`) y efecto secundario (el contexto sigue siendo dueño de `agregarNotificacion`, el fetch+caché de `statsMesAnterior`, y `puedeDispararAlerta` sobre localStorage, que ahora se inyecta como parámetro a las funciones puras).

Cada función pura recibe `(stats, config, puedeDisparar)` y devuelve un array de notificaciones a crear (o, para `calcularProyecciones`, `{ notificaciones, datos }` — preserva el contrato de que el Dashboard puede consumir `gastoDiarioDisponible`/`gastoProyectado`/`diasRestantes` como retorno, aunque en la práctica hoy no lo usa). Cortocircuitos y orden de evaluación de cada regla (ej. "ingreso no configurado" corta las demás alertas) se preservaron exactamente.

47 tests nuevos en 8 archivos, ninguno mockea Supabase ni localStorage — el throttle se inyecta como función mock, cumpliendo el objetivo original de R7 (funciones puras testeables). Firmas públicas de `useNotificaciones()` sin cambios. 328/328 tests, lint y build OK.

### ⏳ Sin encarar

- **UX-17** — validación on-blur en 3 formularios.

Recomendado abordarlos en una sesión dedicada aparte, función por función, con tests de regresión antes de cada movimiento — mover código sin un bug real detrás tiene bajo margen de error tolerado.

### Sin encarar

**UX-17** (validación on-blur, diferido) y el resto de hallazgos P2/P3 menores que no llegaron a evaluarse en detalle.

---

## 0. Resumen ejecutivo

| Eje | Estado | Hallazgo principal |
|---|---|---|
| Tests | 🟢 322 pasando (208 client + 114 server) | Cobertura global **34%** — huecos grandes en `db.js` (8.79%) y `AuthContext` (7%) |
| Seguridad | 🟡 Base sólida, 3 issues reales | **Bug de integridad de ledger** en liquidaciones (confirmado por 2 judges ciegos) |
| Dependencias | 🔴 16 vulns (9 high) | Todas con `npm audit fix` disponible sin romper majors |
| Refactor | 🟡 2 god-files | `db.js` (2337 líneas, 68 funciones) y `grupos.js` (1464 líneas) |
| Código muerto | 🟢 Poco | 7 exports muertos en `db.js` (~130 líneas) + 1 test deshabilitado |
| UX/UI | 🟡 Buena base | Modales sin focus-trap/ESC; hover-lift viola regla del proyecto |

**Fortalezas confirmadas (no tocar):** RLS completo (15/15 tablas, 43 policies), backend bien blindado (helmet, rate limiting, validaciones, payload 10kb, CORS explícito), **sin IDOR/auth-bypass** (routers validan JWT server-side, nunca confían en `user_id` del body), cero secrets committeados, sin `dangerouslySetInnerHTML`, `JSON.parse` protegido contra prototype pollution, lógica de negocio (cuotas/saldos) con funciones puras y redondeo controlado.

---

## 1. TESTS Y CORRECTITUD

### Estado actual
- **Client (Vitest):** 15 archivos, 208 tests, todos verdes.
- **Server (Jest):** 7 archivos, 114 tests, todos verdes.
- **Lint:** limpio. **Build:** OK.
- **Cobertura global: 33.89% statements / 25.2% branches / 38.59% funcs.**

### Huecos de cobertura (dato duro del reporte v8)

| Área | Cobertura | Riesgo |
|---|---|---|
| `lib/db.js` | **8.79%** | ALTO — es el corazón transaccional de la app, casi sin testear |
| `context/AuthContext.jsx` | **7.14%** | ALTO — auth casi sin tests |
| `pages/Dashboard.jsx`, `pages/Movements.jsx` | 0% (ni aparecen) | MEDIO — wizards de gasto/ingreso sin cobertura |
| `utils/format.js` | 50% | MEDIO — formateo de fechas/moneda a medias |
| `hooks/useGrupoGastoForm.js` | 92% | BAJO — bien cubierto |
| `lib/cuotasHelper.js`, `cuotasGroupHelper.js` | alto | BAJO — bien cubierto |

### Tests que FALTAN (para atacar el hueco — NO escritos, solo listados)
- **`db.js` — `createExpense`**: caminos de cuotas (tarjeta/préstamo), rollback manual (ver bug C-01), gasto sin descripción → "SIN DESCRIPCIÓN", `id_categoria` null.
- **`db.js` — grupos/liquidaciones**: `registrarLiquidacion`, `obtenerSaldosDelGrupo`, `crearGastoGrupalEnCuotas`.
- **`AuthContext`**: flujo `onAuthStateChange`, redirección por invitación pendiente, `signOut` global.
- **`calcularDivisionIgualitaria` con `participantesIds` vacío** (división por cero → NaN, ver C-04).
- **`calcularCuotas` con `fechaPrimeraCuota` inválida/undefined** (genera fechas NaN, ver C-03).
- **Integración endpoint n8n**: ya cubierto en `server/tests/n8n.endpoint.test.js` ✅.

### Bugs de correctitud detectados por análisis estático

**C-01 · [P1] `createExpense` con cuotas NO es atómico (viola ACID)**
`client/src/lib/db.js:162-273`
El flujo de cuotas hace **3 operaciones separadas**: insert cuota 1 → update `id_gasto_padre` → insert cuotas 2..N. El "rollback" es manual vía `delete`. Si el proceso muere o pierde conexión entre operaciones, el `delete` nunca corre → **quedan cuotas huérfanas en la DB**. Además el propio `delete` de rollback puede fallar (misma conexión caída) sin reintento.
→ **Fix:** mover a una función RPC de Postgres (`create_expense_installments`) que ejecute todo en una transacción server-side. Es la única forma de garantizar la **A** de ACID que exige `CLAUDE.md`.

**✅ C-02 · [P3] RESUELTO — `id_categoria || null` colapsaba el ID `0` a null**
`client/src/lib/db.js:207-208, 242-243`
`gasto.id_categoria || null` → si el ID fuera `0`, se guardaba `null`. Corregido a `?? null` en ambos caminos (con y sin cuotas, incluyendo el payload del RPC). Cubierto por tests nuevos en `db.createExpense.test.js`.

**C-03 · [P2] `calcularCuotas` sin guard para `fechaPrimeraCuota` inválida**
`client/src/lib/cuotasHelper.js:29`
`fechaPrimeraCuota.slice(0,7).split('-').map(Number)` produce `NaN` si el input es vacío/undefined/malformado → fechas de cuota inválidas insertadas. `createExpense:206` valida presencia (`!gasto.primeraCuota`) pero no formato. → **Fix:** validar formato `YYYY-MM` antes de calcular.

**C-04 · [P3] `calcularDivisionIgualitaria` sin guard de división por cero**
`client/src/lib/cuotasHelper.js:64-67`
Si `participantesIds` está vacío → `n=0` → `monto/0` → `NaN`. El único caller (`useGrupoGastoForm.js:125`) lo protege con `if (!n ...)`, así que hoy no es explotable, pero la función pura debería auto-protegerse. → **Fix:** `if (n === 0) return [];` al inicio.

---

## 2. SEGURIDAD

> 5 judges ciegos en paralelo (auth, input, secrets, api, deps). Convergencia: **input-judge y api-judge marcaron independientemente el MISMO bug** (S-01) → CONFIRMADO.

### CONFIRMADO

**S-01 · [P1 · MEDIUM-HIGH] Bug de integridad de ledger: `paraUserId` sin validar en liquidaciones**
`server/routes/grupos.js:1181-1201` (`POST /:grupoId/liquidaciones`)
El endpoint valida `deUserId === req.user.id` (correcto), pero **nunca valida que `paraUserId` sea un UUID válido ni que sea miembro activo del grupo**. Solo chequea presencia e inequidad.
- **Exploit:** un miembro autenticado envía `{ deUserId: <self>, paraUserId: <UUID arbitrario>, monto: 100 }`. El insert crea una liquidación falsa que altera `vw_grupo_saldos`, permitiéndole **falsear su propio saldo y borrar su deuda** sin consentimiento del otro miembro. Corrompe el ledger financiero compartido — la propiedad ACID crítica de esta app.
- **Fix:** reusar el patrón de `validarParticipantesYMetodoPago`: `UUID_REGEX.test(paraUserId)` + verificar membresía en `grupo_miembros` antes del insert.

### HIGH

**S-02 · [P2 · HIGH] Comparación de API key no constant-time (timing attack)**
`server/index.js:45`
`if (apiKey !== expectedKey)` usa `!==` (short-circuit byte a byte) → filtra timing que permite fuerza bruta progresiva del `N8N_API_KEY`.
→ **Fix:** `crypto.timingSafeEqual` con buffers de igual longitud (chequear length primero).

**S-03 · [P2 · HIGH] Rate-limit "fail-open" en invitaciones**
`server/routes/grupos.js:148-163` (`superaRateLimit`)
Ante error de la query de conteo, la función retorna `false` (= "no limitado, permitir"). Un blip de DB en esa tabla anula el único control anti-spam de invitaciones → email-bombing.
→ **Fix:** fallar cerrado (retornar `true`/bloqueado) ante error, o fallback en memoria.

### MEDIUM

**S-04 · [P2 · MEDIUM] Sin rate-limit por-usuario en endpoints con fan-out de emails**
`server/index.js:101` + `server/routes/grupos.js` (`POST /:grupoId/gastos`)
El límite de `/api/grupos` es 60/min **por IP** y compartido entre todas las acciones. Un miembro puede crear 60 gastos/min, cada uno disparando `notificarMiembros` → email a todos. Grupo de 20 → hasta 1200 emails/min → riesgo de blacklist SMTP.
→ **Fix:** límite por-usuario (no solo IP) específico en mutaciones con fan-out.

**S-05 · [P2 · MEDIUM] Enumeración de usuarios + fuga de PII vía `/usuarios/buscar`**
`server/routes/grupos.js:351-398`
Cualquier admin de *cualquier* grupo puede consultar emails arbitrarios y saber si están registrados + su nombre real. El endpoint n8n sí evita enumeración (mensaje genérico), pero grupos no aplica la misma disciplina.
→ **Fix:** rate-limit por-admin cross-grupos y no devolver `nombre` de no-miembros.

**S-06 · [P2 · MEDIUM] Email header/subject injection vía nombre de grupo/invitador**
`server/services/email.js:369, 404`
El `subject` interpola `invitadorNombre`/`grupoNombre` sin sanitizar CRLF, mientras `fromName` sí se sanitiza (`.replace(/[\r\n\t]/g,' ')`). `grupoNombre` solo pasa por `.trim()` (`db.js:1573`), que no elimina `\r\n` internos.
→ **Fix:** aplicar la misma sanitización de `fromName` a los campos del `subject`. Centralizar en `sanitizeHeaderValue()`.

**S-07 · [P3 · MEDIUM] Sin cota superior en `participantesUserIds`**
`server/routes/grupos.js:838-840, 917-919, 1318-1320`
Solo se valida `length >= 1`, sin máximo. Hasta ~260 UUIDs entran en el body de 10kb; con `cuotas: 18` → ~4680 inserts por request. Amplificación de escritura en DB.
→ **Fix:** cota razonable (ej. `<= 50`) antes de procesar.

### LOW / defensa en profundidad

**S-08 · [P3 · LOW] CSP con `'unsafe-inline'` en `scriptSrc`**
`server/index.js:79` — desactiva la principal defensa de CSP contra XSS inline. Amplifica el riesgo de robo de token (que vive en localStorage por default de supabase-js).
→ **Fix:** migrar a CSP nonce-based; Vite normalmente no requiere inline scripts en el bundle.

**S-09 · [P3 · LOW] `validarMonto` client-side sin `isFinite`**
`client/src/lib/db.js:80-83` — acepta `Infinity`/`"1e400"` (pasa `!isNaN && >0`). El server sí valida `isFinite`. Postgres rechaza `Infinity` en columnas numeric, así que no persiste, pero debería fallar en JS.
→ **Fix:** agregar `!isFinite(num)` al guard.

**S-10 · [P3 · LOW] `idCategoria` sin validar en rutas de gasto grupal**
`server/routes/grupos.js:863, 948, 1366, 1396` — pasa directo al insert sin type-check (a diferencia de `idMetodoPago`). Supabase parametriza (sin SQLi), pero falta validar entero positivo y ownership.

**S-11 · [P3 · LOW] Log de error object completo en endpoint n8n**
`server/index.js:295` — `console.error('...', error)` loguea el objeto entero (el resto del código loguea solo `.message`). Puede filtrar detalles internos de Supabase si los logs van a un sink menos confiable.
→ **Fix:** `error.message` por consistencia.

### Fortalezas verificadas (NO son hallazgos)
- ✅ **Sin IDOR/auth-bypass** — el riesgo #1: todos los routers validan JWT server-side vía `supabaseAdmin.auth.getUser(token)` y usan `req.user.id`, nunca `user_id` del body.
- ✅ **RLS completo**: 15/15 tablas con `ENABLE ROW LEVEL SECURITY`, 43 policies.
- ✅ **Cero secrets committeados** (verificado en git history completo); service role solo server-side; `VITE_*` solo anon key.
- ✅ **Sin `dangerouslySetInnerHTML`**; `JSON.parse` con try/catch + guard de prototype pollution.
- ✅ **Sin SQLi**: los `.or()` solo interpolan UUIDs validados; no hay `.ilike()` con texto libre.
- ✅ **Sin SSRF**: nodemailer usa host de env (server-controlled); links de invitación construidos desde `FRONTEND_URL`, nunca fetcheados.
- ✅ **nodemailer NO recibe input de usuario en `raw`** → la vuln crítica de la dep no es alcanzable aquí.
- ✅ `signOut({ scope: 'global' })` invalida todas las sesiones.
- ✅ Header injection ya mitigado en `fromName` (`email.js:186,367,402`).

---

## 3. DEPENDENCIAS (`npm audit`)

**16 vulnerabilidades: 9 high, 4 moderate, 3 low.** Todas con fix vía `npm audit fix` **sin cambio de majors** (React 19, Express 5, react-router 7 se mantienen).

| ID | Paquete | Sev | Reachability en ESTA app |
|---|---|---|---|
| DEPS-01 | `nodemailer` ≤9 (SSRF/file-read via `raw`) | HIGH | **Teórica** — `email.js` no pasa input de usuario a `raw` |
| DEPS-02 | `react-router-dom` 7.x (XSS/DoS/CSRF) | HIGH | **Teórica** — SPA client-only, sin framework-mode server |
| DEPS-03 | `vite` + `launch-editor` (fs.deny bypass, NTLM leak Windows) | HIGH | **Real pero solo dev local** (Windows) — no en prod |
| DEPS-04 | `ws` (memory disclosure/DoS) | HIGH | **Dead weight** — la app NO usa Supabase realtime |
| DEPS-05 | `form-data` (CRLF multipart) | HIGH | **Inalcanzable** — sin uploads multipart |
| DEPS-06 | `qs` (DoS stringify) | MOD | Teórica — path parse≠stringify |
| DEPS-07 | `js-yaml` (DoS merge-key) | MOD | Solo build-time |

**Acción recomendada:** correr `npm audit fix` en `client/` y `server/`. Ninguna requiere migración mayor. Lockfiles ya committeados (reproducibilidad OK).
**Nota operativa (no seguridad):** `server/.env.example` documenta `RESEND_*` pero el código usa `SMTP_*` (`email.js`). Desincronización — actualizar el example.

---

## 4. REFACTORIZACIÓN (SOLID)

### R1 · [P1] `db.js` (2337 líneas, 68 funciones) viola SRP masivamente
`client/src/lib/db.js` — un solo módulo es el DAL completo de 11+ tablas + mezcla Supabase directo con `fetch` al backend. Ya está seccionado por comentarios `// ===`, lo que hace el split mecánico:
```
db/expenses.js        (113-576)   db/categories.js  (578-665)
db/paymentMethods.js  (667-774)   db/incomes.js     (777-959)
db/recurringIncomes.js(961-1145)  db/profile.js     (1191-1239)
db/stats.js           (1241-1411) db/notifications.js(1413-1549)
db/groups/*.js        (1551-2337, ~790 líneas → subdirectorio propio)
db/_helpers.js        (23-111, helpers internos)
```

### R2 · [P1] `server/routes/grupos.js` (1464 líneas): SRP + OCP
Un router con 6 responsabilidades (invitaciones, búsqueda usuarios, perfiles, gastos, cuotas, liquidaciones), cada handler mezcla validación + datos + notificación + HTTP. Handlers gigantes: `POST /invitaciones` (~145 líneas), `POST /gastos-cuotas` (~170), `PUT /gastos` (~124), `DELETE /:grupoId` (~115).
→ Separar en `routes/grupos/{invitaciones,gastos,liquidaciones,miembros}.js` + capa de servicio.

### R3 · [P2] Boilerplate Supabase repetido (~68 veces)
El patrón `obtenerUsuarioActivo() → from().select/insert → if(error) throw → return data ?? []` se repite en casi todas las funciones de `db.js`. Deletes idénticos: `deleteCategory:652`, `deletePaymentMethod:761`, `deleteIncome:923`, `deleteRecurringIncome:1088`.
En backend, el bloque "obtener grupo + actor + notificar" se repite ~7 veces (`grupos.js:889, 1018, 1069, 1154, 1216, 1267, 1439`).
→ Extraer `queryTabla(...)` / `ejecutarConUsuario(...)` en front y `notificarAccionGrupo(...)` en back.

### R4 · [P2] Lógica de cuotas duplicada front/back (DRY)
`calcularCuotas` existe canónica en `cuotasHelper.js:23`, pero se **recalcula inline** en `grupos.js:1339-1354` y `grupos.js:964-997`. Igual la división: `cuotasHelper.js:64 calcularDivisionIgualitaria` vs `grupos.js:807 calcularParticipantes` (misma fórmula, 2 implementaciones).
→ **Riesgo real:** desincronización de reglas de negocio entre cliente y servidor. El server debería importar el helper compartido.

### R5 · [P2] Magic strings de fecha/regex duplicados
- `'T12:00:00-03:00'` / `'America/Argentina/Buenos_Aires'` ~10 veces en `grupos.js`.
- Regex sufijo cuota `/\s*\(\d+\/\d+\)$/` en `cuotasGroupHelper.js:54,89`, `db.js:2057`, `grupos.js:1159`, `Reportes.jsx:458`.
- Regex UUID en `db.js:592` y `grupos.js:12`. Regex fecha en `db.js:527,1289`.
→ Módulo `constants`/`dateUtils` compartido.

### R6 · [P2] `Dashboard.jsx` (1319 líneas): container + presentational mezclados
Data-fetching + 2 wizards completos + ~530 líneas de JSX inline. El modal de Ingresos (1086-1295) y wizard de Gasto (888-1084) deberían ser `<IngresoModal>` / `<GastoWizard>`. La lista de ingresos usa **estilos inline masivos** con colores hardcodeados (ver D2 de UX). 9 funciones del contexto copiadas a refs (96-114) = síntoma de contexto sobrecargado.

### R7 · [P3] `NotificacionesContext.jsx` (750 líneas) viola SRP
Mezcla estado + panel UI + config + email + throttling + **8 motores de alertas de negocio** (271-706). Las reglas financieras deberían ser `lib/alertas/*.js` puras (reciben stats+config → devuelven notificaciones); el contexto solo orquesta estado.

### R8 · [P3] `Reportes.jsx` (717 líneas): 8 componentes en un archivo
`GraficoBarras` (155-221) y `GraficoDona` (226-293) son complejos (arcos SVG) → mover a `components/reportes/`. `cuotasEnReporte` (439-473) **reimplementa** `transformarGrupoCuotas` de `cuotasGroupHelper.js` → duplicación.

### R9 · [P3] Magic numbers
Límite cuotas `120` (`db.js:171`) vs `18` (`db.js:1986`) sin constante. Rate-limits `1000/10/30/60` literales (`index.js:98-101`). Paginación `perPage=200, page<=10` (2000 users máx) en `grupos.js:57`. Timeouts `400` en `Dashboard.jsx:357,364`.

### R10 · [P3] Agregación de stats triplicada
`getStats` (`db.js:1264`), `getStatsByMonth` (1337), `getReporteByRango` (1405) repiten el cálculo `total/fijos/variables/porCategoria`. → `calcularAgregados(gastos)` puro reutilizable.

---

## 5. CÓDIGO MUERTO / OBSOLETO

### DC-01 · [P2] 7 exports muertos en `db.js` (~130 líneas) — VERIFICADO por grep
Cero consumidores externos e internos (confirmado independientemente):

| Función | Línea |
|---|---|
| `updatePaymentMethod` | `db.js:732` |
| `getMonthlyComparison` | `db.js:1155` |
| `actualizarGrupo` | `db.js:1611` |
| `archivarGrupo` | `db.js:1641` |
| `cambiarRolMiembro` | `db.js:1769` |
| `salirDelGrupo` | `db.js:1809` |
| `obtenerInvitacionesParaMi` | `db.js:1856` |

> ⚠️ Antes de borrar `getMonthlyComparison`, notar que llama a `getGastosByRango`/`getIncomeTotalByMonth`. Esos dos siguen vivos vía `getReporteByRango`/`getStats`, así que quedan. Borrar solo las 7.

### DC-02 · [P3] Test deshabilitado obsoleto
`client/src/pages/Movements.test.js.disabled` — mockea `fetch` global y menciona "Spanish fields", patrón que ya no coincide con el `Movements.jsx` actual. → Borrar (o reescribir alineado al componente real).

### DC-03 · [P3] `calcularParticipantes` redundante (parte de R4)
`grupos.js:807` duplica `calcularDivisionIgualitaria` (`cuotasHelper.js:64`). Consolidar importando el helper.

### Higiene verificada (buena)
- ✅ **Sin bloques de código comentado** (grep dio 0).
- ✅ **Sin TODO/FIXME/HACK reales** (solo "legacy" en contextos legítimos).
- ✅ `cuotasGroupHelper.js` vs `cuotasHelper.js` NO se solapan (responsabilidades distintas).
- ✅ `lib/grupos/saldos.js` en uso; flags de email consumidos por el backend (no muertos).

---

## 6. UX / UI (usabilidad, mobile-first, a11y)

### P1 — Crítico

**UX-01 · Modales sin focus-trap, sin foco inicial, sin retorno de foco, sin ESC**
`client/src/components/Modal.jsx:18-36, 57-85`
El `Modal` base (usado por casi todos los diálogos: gastos, ingresos, editar, ConfirmModal, ResultModal) no mueve el foco al abrir, no lo atrapa (se tabula hacia el dashboard detrás), no lo devuelve al cerrar, no cierra con ESC, y no tiene `role="dialog"`/`aria-modal`/`aria-labelledby`. Incumple WCAG 2.4.3/4.1.2.
> El patrón correcto YA existe en el proyecto: `WelcomeTour.jsx:98` y `NotificacionesPanel.jsx:167` sí implementan `role="dialog"` y ESC. Aplicarlo al `Modal` base arregla ~8 diálogos de una.

**UX-02 · Hover-lift (`translateY`) en cards NO interactivas — viola `CLAUDE.md:16`**
`client/src/index.css:757-761` (`.glass-card:hover { transform: translateY(-2px) }`) se hereda en tarjetas de solo lectura: `DashboardTable`, `Reportes` MetricCard (`index.css:5041`), `DashboardSkeleton`. También `.expense-row:hover { translateX }` (`index.css:1247`) en filas no clickeables.
> En mobile el touch dispara el hover → salto + sombra que sugiere interactividad inexistente. Es exactamente el antipatrón que `CLAUDE.md:16` prohíbe.
→ **Fix:** separar `.glass-card--interactive` para el lift; quitarlo de las informativas.

**UX-03 · Touch targets < 44px en acciones destructivas**
`client/src/index.css:3368-3370` — `.action-btn { width:34px; height:34px }` (editar/eliminar en Movements, tabla y cards mobile). Botones inline de ingresos con `padding:4px 8px` (`Dashboard.jsx:1152,1155`). Sin override a 44px en mobile.
> WCAG 2.5.5 / guías Apple-Android. Alto riesgo de borrar el gasto equivocado en mobile.

### P2 — Importante

- **UX-04 · Labels sin `htmlFor`** en Dashboard/Movements (`Dashboard.jsx:921,930,952...`, `Movements.jsx:500,511...`) — `.form-label-box` sin asociación. `GrupoGastoForm.jsx:136` lo hace bien; `CurrencyInput` ya acepta prop `id` pero no se la pasan.
- **UX-05 · Errores de form sin `aria-describedby`** (`Dashboard.jsx:1047`, `Movements.jsx:559` ni siquiera tiene `role="alert"`).
- **UX-06 · `<div role="button">` en vez de `<button>`** (`SummaryCard.jsx:11`, `GrupoCard.jsx:42`, `NotificacionesPanel.jsx:114`) — teclas Space/Enter inconsistentes.
- **UX-07 · Sin `prefers-reduced-motion`** en toda la app — animaciones infinitas (`income-pulse`, orbs de Welcome, spinners). Incumple WCAG 2.3.3.
- **UX-08 · Contraste dudoso** — texto muted a opacidad 0.45-0.5 sobre glass translúcido en temas oscuros con texto 10-13px probablemente < 4.5:1 AA (`index.css:301-302, 1364`).
- **UX-09 · Destructivas en Configuración sin `ConfirmModal`** (`Configuracion.jsx:268, 387` usan confirm inline "¿Eliminar?"). `CLAUDE.md:192,214` exige `ConfirmModal`.
- **UX-10 · Dos sistemas de labels** (`.form-label-box` vs `.form-label`) y **estilos inline con colores hardcodeados** (`Dashboard.jsx:1141-1197`, `rgba(255,255,255,0.05)`) que no respetan los 18 temas → invisibles en temas claros.

### P3 — Pulido
- **UX-11 · Botones solo-ícono con `title` en vez de `aria-label`** (`Modal.jsx:67`, `Movements.jsx:411`, `Header.jsx:29`, `Sidebar.jsx:98`).
- **UX-12 · Búsqueda global del Header oculta en mobile** sin alternativa (`index.css:2456`).
- **UX-13 · Tabla de Dashboard trunca en vez de scrollear** en mobile (`DashboardTable` con `table-layout:fixed` + ellipsis) — Movements resuelve mejor con vista dual.
- **UX-14 · Feedback de éxito inconsistente** — 3 mecanismos distintos (fase interna en Dashboard, `ResultModal` en Movements, pantalla completa en grupos).
- **UX-15 · Errores de carga silenciosos** en cards secundarias (`Movements.jsx:68-96` solo `console.error`).
- **UX-16 · Formato de moneda inconsistente** — `formatCurrency` vs `toLocaleString` vs `.toFixed(2)` (`GrupoCard.jsx:21` muestra `$1234.50` sin separador de miles).
- **UX-17 · Validación solo on-submit**, nunca on-blur.
- **UX-18 · Listener global de Enter** que hace `activeElement.click()` (`Dashboard.jsx:369-378`) — parche frágil que puede interferir con comportamiento nativo.
- **UX-19 · Sin breadcrumbs** en vistas anidadas de grupos.

### Fortalezas UX verificadas (NO tocar)
- ✅ Manejo de teclado virtual mobile (`useVisualViewportHeight.js` + `Modal.jsx:53` + `env(safe-area-inset-bottom)`).
- ✅ Skeletons fieles (`DashboardSkeleton`), estados vacíos presentes, `aria-live` en spinners.
- ✅ Anti-zoom iOS (`font-size:16px` en inputs mobile) + `inputMode="decimal"`.
- ✅ `aria-label` correcto en campana de notificaciones e `IconPicker`.
- ✅ Prevención de doble-submit en formularios principales.

---

## 7. PLAN DE ACCIÓN SUGERIDO (orden por impacto/riesgo)

### Sprint 1 — Seguridad y correctitud (bloqueantes)
1. **S-01** — validar `paraUserId` en liquidaciones (integridad de ledger). `grupos.js:1181`.
2. **C-01** — `createExpense` atómico vía RPC transaccional. `db.js:162`.
3. **DEPS** — `npm audit fix` en client + server.
4. **S-02** — `crypto.timingSafeEqual` para API key. `index.js:45`.
5. **S-03** — rate-limit fail-closed en invitaciones. `grupos.js:148`.

### Sprint 2 — UX crítico
6. **UX-01** — focus-trap + ESC + roles ARIA en `Modal.jsx`.
7. **UX-02** — separar `.glass-card--interactive` (regla `CLAUDE.md:16`).
8. **UX-03** — touch targets ≥44px en acciones.

### Sprint 3 — Deuda técnica
9. **DC-01/DC-02** — borrar 7 exports muertos + test deshabilitado (bajo riesgo, ~130 líneas).
10. **R4/R5** — consolidar lógica de cuotas y constantes compartidas (elimina bugs de desincronización).
11. **R1/R2** — split de `db.js` y `grupos.js` por dominio.
12. **Tests** — subir cobertura de `db.js` y `AuthContext` (los flujos financieros críticos).

### Sprint 4 — Pulido
13. Resto de hallazgos P2/P3 de UX y refactor.

---

> **Recordatorio:** este documento es solo diagnóstico. Cada cambio debe pasar por el flujo Supervisor → Agente → Supervisor de `CLAUDE.md`, con lint + build antes de cada commit, y los cambios de schema (C-01 requiere RPC) los entrega el supervisor a Nicolás para ejecutar en Supabase.
