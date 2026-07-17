# Diseño: Simplificación de carga de gastos (chips + modelo explícito de método de pago/categoría)

**Fecha:** 2026-07-16
**Estado:** Aprobado por Nicolás — listo para writing-plans

## Contexto y motivación

Inspirado en el análisis del repo `felipeGarciaSuez/caudal` (Django + HTMX, stack distinto — solo se porta el **patrón de UX**, no código). En caudal, el formulario de carga de gasto usa chips de categoría con ícono en vez de dropdowns, y tocar el chip dispara el submit directo.

Regla de oro del proyecto (definida por Nicolás): *"si la app y gestión de gastos se vuelve compleja, o requiere demasiados pasos para usarla, la app muere y nadie la usa"*. El objetivo es reducir la fricción visual/cognitiva del formulario actual **sin perder ninguna funcionalidad existente** (cuotas, tarjeta de crédito, préstamos, gastos fijos/variables).

## Qué NO cambia

- El flujo de submit explícito: el usuario completa el formulario y presiona **"Guardar"**. No se adopta el patrón de caudal de "elegir chip = guardar automático".
- El nombre "Método de Pago" en toda la UI y el código — no se adopta el término "billetera" de caudal, solo el patrón visual de chips.
- El campo Fecha se mantiene como input de fecha editable (sin cambios).
- La lógica de cálculo de cuotas (`cuotasHelper.js`, `calcularCuotas`) no se toca — solo cambia cómo se *dispara* la sección de cuotas en el form.
- El modelo de "cada cuota es una fila separada vinculada por `id_gasto_padre`" se mantiene igual.

## Qué cambia

### 1. Modelo de datos

**Tabla `metodos_pago`** — nuevas columnas:
| Columna | Tipo | Default | Propósito |
|---|---|---|---|
| `tipo` | VARCHAR(20) | `'efectivo'` | Valores: `efectivo`, `tarjeta`, `cuenta` |
| `acepta_cuotas` | BOOLEAN | `false` | Reemplaza el string-match `nombre === 'TARJETA DE CREDITO'` |
| `icono` | VARCHAR(50) | `'payments'` | Nombre del ícono Material Symbols |
| `user_id` | UUID (FK auth.users, nullable) | — | Ya existía la columna; se habilita CRUD real de usuario (antes solo lectura global) |

**Tabla `categorias`** — nuevas columnas:
| Columna | Tipo | Default | Propósito |
|---|---|---|---|
| `icono` | VARCHAR(50) | `'label'` | Nombre del ícono Material Symbols |
| `es_prestamo` | BOOLEAN | `false` | Reemplaza el string-match `nombre === 'PRESTAMOS'` |

**Migración de datos existentes** (una sola vez, ejecutada por Nicolás vía SQL Editor de Supabase):
- Fila de `metodos_pago` con `nombre = 'TARJETA DE CREDITO'` → `tipo='tarjeta', acepta_cuotas=true`.
- Resto de métodos de pago existentes → `tipo='efectivo'` o `'cuenta'` según corresponda (a confirmar caso por caso con Nicolás antes de correr la migración).
- Categoría con `nombre = 'PRESTAMOS'` → `es_prestamo=true`.
- Asignación de íconos por defecto a categorías/métodos de pago existentes: a definir un mapeo razonable (ej. Supermercado→`shopping_cart`, Transporte→`directions_car`, etc.) como parte de la migración, revisado por Nicolás antes de aplicar.

**RLS**: extender policies de `metodos_pago` para permitir insert/update/delete de usuario (`user_id = auth.uid()`), igual patrón que `categorias` ya tiene hoy. Global (`user_id IS NULL`) sigue sin ser editable por el usuario.

### 2. Componente nuevo: `ChipSelector`

Componente reutilizable en `client/src/components/`, usado en 3 lugares del formulario: categoría, método de pago, fijo/variable.

**Props:**
- `opciones`: array de `{id, nombre, icono}`.
- `valorSeleccionado`: id actualmente elegido.
- `onChange(id)`: callback al seleccionar un chip.
- `limiteVisible`: cantidad de chips mostrados antes de "Ver más" (default 6; no aplica al selector fijo/variable, que siempre tiene 2 opciones).

**Comportamiento:**
- Renderiza chips en grid/wrap: ícono Material Symbol + nombre, estilo Glassmorphism consistente con el resto de la app.
- Chip activo con estilo visualmente distinto (borde/fondo resaltado).
- Si `opciones.length > limiteVisible`: se muestran las primeras `limiteVisible` + un chip final "Ver más" (ícono `expand_more`) que al tocarlo despliega el resto in-place (sin modal ni navegación).

### 3. Componente nuevo: `IconPicker`

Usado en los modales de alta/edición de categoría y método de pago.

**Comportamiento:**
- Grid de íconos Material Symbols curados (lista fija de 30-50 íconos comunes a definir: comida, transporte, salud, entretenimiento, servicios, etc.) — no la librería completa.
- Buscador de texto simple para filtrar la lista curada por nombre.
- Al seleccionar, se guarda el string del ícono (ej. `"shopping_cart"`) en la columna `icono`.

### 4. Formulario de carga de gasto (Dashboard.jsx) — nuevo orden

1. Descripción — sin cambios.
2. Monto (`CurrencyInput`) — sin cambios.
3. Fecha — sin cambios.
4. **Categoría** → `ChipSelector` (reemplaza `<select>` nativo).
5. **Método de Pago** → `ChipSelector` (reemplaza `<select>` nativo).
6. **Fijo / Variable** → `ChipSelector` de 2 opciones (reemplaza el checkbox `es_fijo`). Solo visible si el método de pago elegido tiene `acepta_cuotas=false` Y la categoría elegida tiene `es_prestamo=false` (mismo condicional que hoy tiene el checkbox, ahora disparado por flags en vez de comparación de nombre).
7. Condicional cuotas — se muestra automáticamente si el método de pago elegido tiene `acepta_cuotas=true`, o si la categoría elegida tiene `es_prestamo=true`: cuotas (select 1-18 o 1-120 según corresponda) + mes de primera/primer cuota. Lógica de cálculo sin cambios.
8. Botón "Guardar" — sin cambios, sigue siendo submit explícito.

### 5. Gestión de categorías y métodos de pago (CRUD)

- **Categorías**: el alta existente (`createCategory`) se extiende para aceptar `icono`. Se agrega selector de ícono al modal de creación/edición (hoy solo pide nombre).
- **Métodos de pago**: se agregan `createPaymentMethod`, `updatePaymentMethod`, `deletePaymentMethod` en `db.js` (hoy solo existe `getPaymentMethods`, sin CRUD de cliente). El alta pide: nombre, tipo (efectivo/tarjeta/cuenta), ícono, y toggle "acepta cuotas".

## Fuera de alcance (explícitamente descartado en esta iteración)

- Migración de Supabase/Postgres a SQL Server — evaluado y descartado por ahora. Única motivación era comodidad personal, no un requerimiento de negocio (costo, compliance, control de infra). Si en el futuro aparece una razón de peso, se trata como su propio proyecto con su propio brainstorming.
- Concepto de "billetera" con saldo/balance — no existe hoy y no se agrega en esta iteración. Métodos de pago siguen siendo un catálogo simple (nombre + tipo + ícono + acepta_cuotas), sin monto ni cuenta bancaria asociada.
- Auto-submit al elegir chip (patrón de caudal) — descartado explícitamente por Nicolás, se mantiene el submit manual vía botón "Guardar".
- Parsing de texto libre / NLP para categorización automática — no existe en caudal tampoco (se confirmó en el análisis del repo), no aplica acá.

## Archivos afectados (referencia para el plan de implementación)

- `server/db/migrations/` — nueva migración SQL (columnas + RLS + datos existentes).
- `TECHNICAL_DOCS.md` — actualizar documentación de schema.
- `client/src/lib/db.js` — extender `createCategory`, agregar CRUD de `metodos_pago`.
- `client/src/components/ChipSelector.jsx` — nuevo.
- `client/src/components/IconPicker.jsx` — nuevo.
- `client/src/pages/Dashboard.jsx` — reemplazar selects por `ChipSelector`, actualizar lógica de detección de cuotas/préstamo (de string-match a flags).
- `client/src/pages/Movements.jsx` — modal de edición de gasto, mismo reemplazo de selects.
- `client/src/lib/cuotasGroupHelper.js` — actualizar `filtrarTarjetaCredito`/`filtrarPrestamos` para usar flags en vez de comparación de nombre.
- `client/src/pages/Configuracion.jsx` — modales de alta/edición de categoría y método de pago, agregar `IconPicker`.
