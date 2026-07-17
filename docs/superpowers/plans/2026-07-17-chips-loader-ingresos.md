# Chips + loader in-modal para ingresos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el select nativo de categoría y el checkbox "recurrente" del formulario de ingreso por `ChipSelector`, y agregar el mismo mecanismo de spinner→resultado in-modal ya usado en gastos a las 4 acciones de ingreso (crear, editar, eliminar puntual, eliminar recurrente) — sin cerrar el modal al terminar, a diferencia de gastos.

**Architecture:** Migración SQL agrega `icono` a `categorias_ingresos` (a cargo de Nicolás como Supervisor). En `Dashboard.jsx` se agrega un state `faseIngreso` (`'form' | 'guardando' | 'resultado'`) que controla qué se renderiza dentro del `<Modal isOpen={isIncomeModalOpen}>` ya existente, siguiendo el mismo patrón que `faseGasto` implementado previamente para el modal de gastos. El reset de `incomeForm`/`incomeEditando`/`faseIngreso` se centraliza en `handleAbrirIngresos` (único punto de apertura del modal, confirmado — no hay FAB ni otro camino). Las 4 acciones (`handleSaveIncome`, `handleEliminarIngreso`, `handleEliminarRecurrente`) transicionan por `guardando`→`resultado`; al confirmar el resultado, se vuelve a `faseIngreso: 'form'` sin cerrar el modal.

**Tech Stack:** React 19 (hooks, JSX condicional), CSS puro (reutiliza estilos `.result-modal*` ya existentes), PostgreSQL/Supabase (migración SQL).

---

## Contexto de archivos

- `client/src/pages/Dashboard.jsx` — contiene el modal de Ingresos (formulario + lista, líneas ~973-1107 aprox., sujeto a shift), `handleAbrirIngresos` (línea 443), `handleSaveIncome` (línea 456), `handleEliminarIngreso` (línea 513), `handleEliminarRecurrente` (línea 531), y el `ConfirmModal` de eliminar (línea 1110).
- `client/src/components/ChipSelector.jsx` — componente ya existente, reutilizado tal cual (props: `opciones`, `valorSeleccionado`, `onChange`, `limiteVisible`).
- `client/src/lib/db.js` — `getIncomeCategories()` (línea 967) ya trae `*` de `categorias_ingresos`, así que una vez agregada la columna `icono` en la DB, el campo llega solo sin cambios de código en `db.js`.
- `server/db/migrations/` — nueva migración SQL.

No hay tests de componente para `Dashboard.jsx` (mismo estado que la iteración anterior de gastos) — verificación es manual en browser (Task 5).

---

### Task 1: Migración SQL — columna `icono` en `categorias_ingresos`

**Files:**
- Create: `server/db/migrations/20260717_chips_categorias_ingresos.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Descripción: Agrega columna icono a categorias_ingresos para soportar ChipSelector
-- con ícono en el formulario de ingresos, mismo mecanismo que categorias/metodos_pago
-- (ver 20260716_chips_categorias_metodos_pago.sql).

ALTER TABLE categorias_ingresos ADD COLUMN IF NOT EXISTS icono VARCHAR(50) NOT NULL DEFAULT 'payments';

-- ── Asignación de íconos a categorías existentes ────────────
-- Basado en las 6 categorías confirmadas por Nicolás (id 1-6, todas globales user_id NULL):
UPDATE categorias_ingresos SET icono = 'payments'     WHERE UPPER(nombre) = 'SUELDO';
UPDATE categorias_ingresos SET icono = 'laptop_mac'    WHERE UPPER(nombre) = 'FREELANCE';
UPDATE categorias_ingresos SET icono = 'sell'          WHERE UPPER(nombre) = 'VENTA';
UPDATE categorias_ingresos SET icono = 'swap_horiz'    WHERE UPPER(nombre) = 'TRANSFERENCIA';
UPDATE categorias_ingresos SET icono = 'undo'          WHERE UPPER(nombre) = 'REINTEGRO';
UPDATE categorias_ingresos SET icono = 'more_horiz'    WHERE UPPER(nombre) = 'OTRO';

-- Verificar tras ejecutar:
-- SELECT id, nombre, icono FROM categorias_ingresos ORDER BY id;
```

- [ ] **Step 2: Entregar el SQL a Nicolás**

Este paso NO lo ejecuta el agente ni el implementador — el agente solo crea el archivo. Nicolás (Supervisor) corre el SQL en Supabase → SQL Editor y confirma antes de que el resto del plan dependa de la columna `icono` estando disponible en producción. En desarrollo/testing local, si el proyecto usa una instancia de Supabase compartida, la columna ya estará disponible una vez Nicolás confirme.

- [ ] **Step 3: Commit**

```bash
git add server/db/migrations/20260717_chips_categorias_ingresos.sql
git commit -m "feat(db): agregar columna icono a categorias_ingresos"
```

---

### Task 2: Reemplazar select de categoría y checkbox de recurrente por ChipSelector

**Files:**
- Modify: `client/src/pages/Dashboard.jsx` (formulario de ingreso dentro del modal, JSX únicamente — no toca handlers todavía)

- [ ] **Step 1: Localizar el bloque actual del formulario**

Dentro del `<Modal>` de Ingresos, buscar el `<form onSubmit={handleSaveIncome}>`. El bloque de categoría y recurrente hoy es:

```jsx
                        <div className="form-group">
                            <label className="form-label-box">Categoría (opcional)</label>
                            <select
                                value={incomeForm.categoria_id}
                                onChange={(e) => setIncomeForm(prev => ({ ...prev, categoria_id: e.target.value }))}
                                className="form-select"
                            >
                                <option value="">Sin categoría</option>
                                {categoriaIngresos.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>
                        {/* Solo mostrar checkbox recurrente al crear, no al editar */}
                        {!incomeEditando && (
                            <div className="form-checkbox-group">
                                <input
                                    type="checkbox"
                                    id="es_recurrente"
                                    checked={incomeForm.es_recurrente}
                                    onChange={(e) => setIncomeForm(prev => ({ ...prev, es_recurrente: e.target.checked }))}
                                />
                                <label htmlFor="es_recurrente">Ingreso recurrente (se repite cada mes)</label>
                            </div>
                        )}
```

- [ ] **Step 2: Reemplazar por ChipSelector**

```jsx
                        <div className="form-group">
                            <label className="form-label-box">Categoría (opcional)</label>
                            <ChipSelector
                                opciones={[
                                    { id: '', nombre: 'Sin categoría', icono: 'block' },
                                    ...categoriaIngresos,
                                ]}
                                valorSeleccionado={incomeForm.categoria_id ? Number(incomeForm.categoria_id) : ''}
                                onChange={(id) => setIncomeForm(prev => ({ ...prev, categoria_id: id === '' ? '' : id }))}
                                limiteVisible={6}
                            />
                        </div>
                        {/* Solo mostrar selector recurrente al crear, no al editar */}
                        {!incomeEditando && (
                            <div className="form-group">
                                <label className="form-label-box">Tipo de ingreso</label>
                                <ChipSelector
                                    opciones={[
                                        { id: 'puntual', nombre: 'Puntual', icono: 'event' },
                                        { id: 'recurrente', nombre: 'Recurrente', icono: 'repeat' },
                                    ]}
                                    valorSeleccionado={incomeForm.es_recurrente ? 'recurrente' : 'puntual'}
                                    onChange={(id) => setIncomeForm(prev => ({ ...prev, es_recurrente: id === 'recurrente' }))}
                                    limiteVisible={2}
                                />
                            </div>
                        )}
```

Nota sobre el chip "Sin categoría": su `id` es `''` (string vacío), igual que el `value=""` del `<option>` nativo que reemplaza — así `incomeForm.categoria_id` sigue siendo `''` cuando no hay categoría, sin cambiar el shape de datos que `handleSaveIncome`/`db.createIncome` ya esperan. El resto de `categoriaIngresos` usa sus `id` numéricos reales de la tabla, igual que hoy.

- [ ] **Step 3: Lint y build**

Run: `npm --prefix client run lint && npm --prefix client run build`
Expected: ambos sin errores. (No requiere que la migración de Task 1 ya esté aplicada en la DB real — `ChipSelector` renderiza igual con el `icono` default `'payments'` si la columna aún no llegó, ya que `getIncomeCategories()` trae `*` sin filtrar columnas.)

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): reemplazar select y checkbox de ingreso por ChipSelector"
```

---

### Task 3: Agregar state `faseIngreso` y reordenar los 3 handlers de acción

**Files:**
- Modify: `client/src/pages/Dashboard.jsx` (declaración de state, `handleAbrirIngresos`, `handleSaveIncome`, `handleEliminarIngreso`, `handleEliminarRecurrente`)

- [ ] **Step 1: Agregar el state `faseIngreso` y `resultadoIngreso` junto a los states de ingreso existentes**

Localizar la declaración de `incomeConfirmDelete` (cerca de `incomeForm`/`incomeEditando`) y agregar justo después:

```js
    const [incomeConfirmDelete, setIncomeConfirmDelete] = useState(null);
    // Fase visual del modal de Ingresos: 'form' (formulario+lista), 'guardando' (spinner
    // mientras corre la acción) o 'resultado' (popup de éxito/error). A diferencia del
    // modal de gastos, acá el modal NO se cierra al llegar a 'resultado' — es un panel
    // persistente pensado para cargar varios ingresos seguidos.
    const [faseIngreso, setFaseIngreso] = useState('form');
    const [resultadoIngreso, setResultadoIngreso] = useState(null);
```

- [ ] **Step 2: Centralizar el reset en `handleAbrirIngresos`**

Reemplazar:

```js
    const handleAbrirIngresos = () => {
        setIncomeForm(INCOME_FORM_INICIAL);
        setIncomeEditando(null);
        setIsIncomeModalOpen(true);
        fetchIngresosMes();
        fetchRecurrentes();
    };
```

por:

```js
    const handleAbrirIngresos = () => {
        setIncomeForm(INCOME_FORM_INICIAL);
        setIncomeEditando(null);
        setFaseIngreso('form');
        setResultadoIngreso(null);
        setIsIncomeModalOpen(true);
        fetchIngresosMes();
        fetchRecurrentes();
    };
```

- [ ] **Step 3: Reordenar `handleSaveIncome` para pasar por `guardando`/`resultado`**

Reemplazar la función completa:

```js
    const handleSaveIncome = async (e) => {
        e.preventDefault();
        const hoy = new Date();
        const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        setFaseIngreso('guardando');
        try {
            if (incomeEditando) {
                await db.updateIncome(incomeEditando, {
                    monto:        incomeForm.monto,
                    descripcion:  incomeForm.descripcion,
                    categoria_id: incomeForm.categoria_id || null,
                });
                agregarNotificacion({ titulo: 'Ingreso actualizado', mensaje: `Ingreso de $${Number(incomeForm.monto).toLocaleString('es-AR')} modificado.`, tipo: 'info', origen: 'ingresos' });
                setResultadoIngreso({ tipo: 'success', titulo: 'Ingreso actualizado' });
            } else {
                // Si marcó recurrente, también lo registra en ingresos_recurrentes
                if (incomeForm.es_recurrente) {
                    await db.createRecurringIncome({
                        descripcion:  incomeForm.descripcion || 'Ingreso recurrente',
                        monto:        incomeForm.monto,
                        categoria_id: incomeForm.categoria_id || null,
                        fecha_inicio: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`,
                    });
                }
                await db.createIncome({
                    monto:        incomeForm.monto,
                    fecha:        fechaHoy,
                    descripcion:  incomeForm.descripcion,
                    categoria_id: incomeForm.categoria_id || null,
                });
                agregarNotificacion({ titulo: 'Ingreso registrado', mensaje: `Se registró un ingreso de $${Number(incomeForm.monto).toLocaleString('es-AR')}.`, tipo: 'success', origen: 'ingresos' });
                setResultadoIngreso({ tipo: 'success', titulo: '¡Ingreso registrado!' });
            }
            setFaseIngreso('resultado');
            await Promise.all([fetchIngresosMes(), fetchRecurrentes(), fetchStats({ verificarAlertas: true, mostrarSkeleton: false })]);
        } catch (err) {
            console.error('❌ Error al guardar ingreso:', err);
            agregarNotificacion({
                titulo: 'Error al guardar ingreso',
                mensaje: err.message || 'No se pudo guardar el ingreso. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
            setResultadoIngreso({ tipo: 'error', titulo: 'No se pudo guardar el ingreso', mensaje: err.message });
            setFaseIngreso('resultado');
        }
    };
```

Cambios vs. el original: se agrega `setFaseIngreso('guardando')` al inicio (tras armar `fechaHoy`, antes del `try`). Se agrega `setResultadoIngreso(...)` + `setFaseIngreso('resultado')` en cada rama de éxito y en el catch. **Se quitan** `setIncomeForm(INCOME_FORM_INICIAL)`, `setIncomeEditando(null)`, `setIsIncomeModalOpen(false)` que estaban al final del bloque de éxito — el modal ya NO se cierra ni se resetea el form acá; eso ocurre recién cuando el usuario confirma el popup de resultado (Task 4) o la próxima vez que se abre el modal (`handleAbrirIngresos`, Task 3 Step 2).

- [ ] **Step 4: Reordenar `handleEliminarIngreso`**

Reemplazar:

```js
    const handleEliminarIngreso = async (id) => {
        try {
            await db.deleteIncome(id);
            setIncomeConfirmDelete(null);
            agregarNotificacion({ titulo: 'Ingreso eliminado', mensaje: 'El ingreso fue eliminado del período.', tipo: 'warning', origen: 'ingresos' });
            await Promise.all([fetchIngresosMes(), fetchStats({ verificarAlertas: true, mostrarSkeleton: false })]);
        } catch (err) {
            console.error('❌ Error al eliminar ingreso:', err);
            agregarNotificacion({
                titulo: 'Error al eliminar ingreso',
                mensaje: 'No se pudo eliminar el ingreso. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
        }
    };
```

por:

```js
    const handleEliminarIngreso = async (id) => {
        setIncomeConfirmDelete(null);
        setFaseIngreso('guardando');
        try {
            await db.deleteIncome(id);
            agregarNotificacion({ titulo: 'Ingreso eliminado', mensaje: 'El ingreso fue eliminado del período.', tipo: 'warning', origen: 'ingresos' });
            setResultadoIngreso({ tipo: 'success', titulo: 'Ingreso eliminado' });
            setFaseIngreso('resultado');
            await Promise.all([fetchIngresosMes(), fetchStats({ verificarAlertas: true, mostrarSkeleton: false })]);
        } catch (err) {
            console.error('❌ Error al eliminar ingreso:', err);
            agregarNotificacion({
                titulo: 'Error al eliminar ingreso',
                mensaje: 'No se pudo eliminar el ingreso. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
            setResultadoIngreso({ tipo: 'error', titulo: 'No se pudo eliminar el ingreso' });
            setFaseIngreso('resultado');
        }
    };
```

Nota: `setIncomeConfirmDelete(null)` se movió al principio de la función (antes cerraba el `ConfirmModal` recién tras el `await db.deleteIncome`; ahora lo cierra de entrada, para que el `ConfirmModal` no quede visible superpuesto con la fase `guardando` del modal de Ingresos que aparece detrás).

- [ ] **Step 5: Reordenar `handleEliminarRecurrente`**

Reemplazar:

```js
    const handleEliminarRecurrente = async (id) => {
        try {
            await db.deleteRecurringIncome(id);
            setIncomeConfirmDelete(null);
            agregarNotificacion({ titulo: 'Recurrente eliminado', mensaje: 'El ingreso recurrente fue eliminado.', tipo: 'warning', origen: 'ingresos' });
            await Promise.all([fetchRecurrentes()]);
        } catch (err) {
            console.error('❌ Error al eliminar recurrente:', err);
            agregarNotificacion({
                titulo: 'Error al eliminar recurrente',
                mensaje: 'No se pudo eliminar el ingreso recurrente. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
        }
    };
```

por:

```js
    const handleEliminarRecurrente = async (id) => {
        setIncomeConfirmDelete(null);
        setFaseIngreso('guardando');
        try {
            await db.deleteRecurringIncome(id);
            agregarNotificacion({ titulo: 'Recurrente eliminado', mensaje: 'El ingreso recurrente fue eliminado.', tipo: 'warning', origen: 'ingresos' });
            setResultadoIngreso({ tipo: 'success', titulo: 'Recurrente eliminado' });
            setFaseIngreso('resultado');
            await Promise.all([fetchRecurrentes()]);
        } catch (err) {
            console.error('❌ Error al eliminar recurrente:', err);
            agregarNotificacion({
                titulo: 'Error al eliminar recurrente',
                mensaje: 'No se pudo eliminar el ingreso recurrente. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
            setResultadoIngreso({ tipo: 'error', titulo: 'No se pudo eliminar el recurrente' });
            setFaseIngreso('resultado');
        }
    };
```

- [ ] **Step 6: Agregar `handleVolverFormularioIngreso`**

Justo después de `handleEliminarRecurrente`, agregar la función que el botón "Continuar" del popup de resultado va a llamar (Task 4):

```js
    /** Vuelve a la fase de formulario tras ver el resultado, sin cerrar el modal de Ingresos. */
    const handleVolverFormularioIngreso = () => {
        setFaseIngreso('form');
        setResultadoIngreso(null);
    };
```

- [ ] **Step 7: Lint**

Run: `npm --prefix client run lint`
Expected: puede haber `no-unused-vars` sobre `faseIngreso`/`resultadoIngreso`/`handleVolverFormularioIngreso` si todavía no están referenciados en JSX — eso se resuelve en Task 4. Si lint falla por cualquier OTRA razón, es un problema real a corregir ahora.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): agregar fase de guardado a las acciones de ingreso"
```

---

### Task 4: Render condicional por fase dentro del modal de Ingresos

**Files:**
- Modify: `client/src/pages/Dashboard.jsx` (bloque del `<Modal>` de Ingresos)

- [ ] **Step 1: Localizar el bloque actual**

Buscar el comentario `{/* Modal: Ingresos */}`. La estructura actual (antes de este cambio) es:

```jsx
            <Modal
                isOpen={isIncomeModalOpen}
                onClose={() => { setIsIncomeModalOpen(false); setIncomeEditando(null); }}
                title="Ingresos"
                subtitle="Registrá tus ingresos del mes"
                disableClose={!!incomeConfirmDelete}
            >
                <div className="form-container">
                    <form onSubmit={handleSaveIncome}>
                        {/* ... campos monto/descripción/categoría/recurrente/botones ... */}
                    </form>

                    {/* Lista de ingresos del mes */}
                    {ingresosMes.length > 0 && (
                        <div style={{ marginTop: '20px' }}>
                            {/* ... lista ... */}
                        </div>
                    )}
                </div>
            </Modal>
```

- [ ] **Step 2: Condicionar `onClose`/`disableClose` a la fase, y envolver el contenido en `faseIngreso === 'form'`**

Reemplazar la apertura del `<Modal ...>` y el wrapping de su contenido:

```jsx
            <Modal
                isOpen={isIncomeModalOpen}
                onClose={faseIngreso === 'form' ? () => { setIsIncomeModalOpen(false); setIncomeEditando(null); } : undefined}
                title={faseIngreso === 'form' ? 'Ingresos' : undefined}
                subtitle={faseIngreso === 'form' ? 'Registrá tus ingresos del mes' : undefined}
                disableClose={!!incomeConfirmDelete}
            >
                {faseIngreso === 'form' && (
                    <div className="form-container">
                        <form onSubmit={handleSaveIncome}>
                            {/* ... MISMO CONTENIDO EXISTENTE, YA CON LOS CHIPS DE TASK 2, SIN CAMBIOS ADICIONALES AQUÍ ... */}
                        </form>

                        {/* Lista de ingresos del mes */}
                        {ingresosMes.length > 0 && (
                            <div style={{ marginTop: '20px' }}>
                                {/* ... MISMA LISTA EXISTENTE, SIN CAMBIOS ... */}
                            </div>
                        )}
                    </div>
                )}
                {faseIngreso === 'guardando' && (
                    <div className="result-modal" role="status" aria-live="polite">
                        <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                            progress_activity
                        </span>
                        <h3 className="result-modal__titulo">Guardando...</h3>
                    </div>
                )}
                {faseIngreso === 'resultado' && resultadoIngreso && (
                    <div className="result-modal">
                        <span
                            className="material-symbols-outlined result-modal__icono"
                            style={{
                                color: resultadoIngreso.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                                borderColor: resultadoIngreso.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                            }}
                        >
                            {resultadoIngreso.tipo === 'error' ? 'cancel' : 'check_circle'}
                        </span>
                        <h3 className="result-modal__titulo">{resultadoIngreso.titulo}</h3>
                        {resultadoIngreso.mensaje && (
                            <p className="result-modal__subtexto">{resultadoIngreso.mensaje}</p>
                        )}
                        <button
                            type="button"
                            className={`btn result-modal__boton result-modal__boton--${resultadoIngreso.tipo === 'error' ? 'error' : 'success'}`}
                            onClick={handleVolverFormularioIngreso}
                        >
                            Continuar
                        </button>
                    </div>
                )}
            </Modal>
```

CRITICAL: el contenido dentro de `{faseIngreso === 'form' && (...)}` debe ser EXACTAMENTE el mismo `<div className="form-container">...</div>` que existe hoy en el archivo — incluyendo los cambios ya aplicados por Task 2 (ChipSelector de categoría y de tipo de ingreso). Esta task NO reescribe el formulario ni la lista, solo los envuelve en el nuevo condicional de fase. Leé el contenido real actual del archivo antes de escribir el reemplazo, no asumas el contenido abreviado de este prompt.

Nota sobre `disableClose`: se mantiene igual (`!!incomeConfirmDelete`) en las 3 fases — sigue bloqueando el cierre mientras el `ConfirmModal` de eliminar está abierto, sin importar en qué fase esté el modal de Ingresos detrás.

- [ ] **Step 3: Lint y build**

Run: `npm --prefix client run lint && npm --prefix client run build`
Expected: ambos sin errores. Esto también debe resolver cualquier `no-unused-vars` pendiente de Task 3.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): mostrar spinner y resultado dentro del modal de ingresos"
```

---

### Task 5: Verificación manual en browser

**Files:** ninguno (solo verificación funcional). Requiere que Nicolás haya corrido la migración de Task 1 antes de este paso (si no, los chips de categoría van a mostrar el ícono default `payments` para todas — funcional pero sin distinción visual).

- [ ] **Step 1: Levantar el entorno**

Run: `npm run dev`

- [ ] **Step 2: Crear ingreso puntual**

1. Abrir "Ingresos".
2. Completar monto, elegir categoría vía chip (confirmar que el chip "Sin categoría" también funciona), dejar "Puntual" seleccionado (default).
3. Tocar "Agregar ingreso".
4. Verificar: spinner "Guardando..." aparece en el mismo lugar del formulario (sin cerrar el modal), luego muta a "¡Ingreso registrado!" con botón "Continuar".
5. Tocar "Continuar": vuelve al formulario+lista (el modal sigue abierto), la lista de ingresos del mes debe mostrar el nuevo ingreso.

- [ ] **Step 3: Crear ingreso recurrente**

1. En el mismo modal (sin cerrarlo), completar otro ingreso, elegir chip "Recurrente".
2. Guardar — mismo comportamiento de spinner→resultado→vuelta al form.

- [ ] **Step 4: Editar ingreso**

1. Tocar el ícono de editar en un ingreso de la lista.
2. Confirmar que el chip de "Tipo de ingreso" NO aparece en modo edición (igual que hoy el checkbox).
3. Modificar el monto, tocar "Actualizar".
4. Verificar spinner→resultado ("Ingreso actualizado")→vuelta al form con la lista actualizada.

- [ ] **Step 5: Eliminar ingreso puntual**

1. Tocar el ícono de eliminar en un ingreso de la lista.
2. Confirmar en el `ConfirmModal` ("¿Querés eliminar...?").
3. Verificar: el `ConfirmModal` se cierra, y el modal de Ingresos (detrás) muestra spinner→"Ingreso eliminado"→vuelta al form, lista actualizada sin ese ingreso.

- [ ] **Step 6: Eliminar recurrente**

Repetir el paso anterior sobre un ingreso marcado como recurrente (buscar la sección de recurrentes activos si existe en el modal, o el badge "recurrente" en la lista).

- [ ] **Step 7: Caso de error**

Cortar la conexión un instante y tocar "Agregar ingreso" — verificar que el spinner muta a ícono de error en vez de quedar colgado, y que "Continuar" permite reintentar sin dejar el formulario en un estado raro.

- [ ] **Step 8: Regresión — cierre manual**

1. Abrir "Ingresos", tocar la X del header sin guardar nada — debe cerrar sin problemas.
2. Reabrir — confirmar que el formulario está limpio (sin datos de la sesión anterior) y `faseIngreso` arranca en `'form'`.
3. Durante la fase `guardando` o `resultado`, confirmar que no hay X visible (mismo comportamiento que gastos).

---

## Self-Review

**Spec coverage:**
- Migración SQL con columna `icono` + mapeo de íconos por las 6 categorías reales → Task 1. ✅
- ChipSelector para categoría (con chip "Sin categoría") y para tipo de ingreso (puntual/recurrente) → Task 2. ✅
- `faseIngreso`/`resultadoIngreso` state, reset centralizado en `handleAbrirIngresos`, las 4 acciones (crear, editar, eliminar puntual, eliminar recurrente) pasando por guardando→resultado → Task 3. ✅
- Modal NO se cierra al llegar a resultado, vuelve a `form` sin cerrar → Task 3 Step 6 (`handleVolverFormularioIngreso`) + Task 4. ✅
- `ConfirmModal` de eliminar se mantiene sin cambios de comportamiento, solo se cierra antes de mostrar el spinner → Task 3 Step 4/5. ✅
- Reutilización de `mostrarSkeleton: false` ya existente en las llamadas a `fetchStats` de ingresos → confirmado, ningún task lo modifica (ya estaba correcto). ✅
- Único punto de apertura del modal (`handleAbrirIngresos`) confirmado, sin necesidad de un fix equivalente al bug del FAB de gastos. ✅

**Placeholder scan:** sin TBD/TODO. Task 4 Step 2 tiene una nota explícita de "leer el contenido real antes de reemplazar" en vez de codificar el JSX completo del formulario/lista dos veces — es una instrucción deliberada para el implementador (evitar duplicar ~130 líneas ya escritas en Task 2), no un placeholder de contenido faltante.

**Type consistency:** `faseIngreso`/`resultadoIngreso` usan los mismos 3 valores literales y el mismo shape `{ tipo, titulo, mensaje? }` que `faseGasto`/`resultadoGasto` del modal de gastos (mismo componente CSS `.result-modal*`, mismas clases `result-modal__boton--success`/`--error`). `handleVolverFormularioIngreso` se define en Task 3 y se referencia igual en Task 4 (botón "Continuar"). `incomeConfirmDelete`/`ConfirmModal` no cambian de shape en ningún task.
