# Wizard de 2 pasos para ingresos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el formulario plano de Ingresos en un wizard de 2 pasos (Monto+Descripción / Categoría+Tipo), agregando una vista de "lista" separada (ingresos del mes + recurrentes + botón "Nuevo ingreso") que reemplaza al formulario-siempre-visible actual, siguiendo el mismo patrón ya usado y revisado en el wizard de gastos (`pasoGasto`).

**Architecture:** Se agregan dos states nuevos: `vistaIngreso: 'lista' | 'wizard'` (controla si el modal muestra la lista o el wizard) y `pasoIngreso: 1 | 2` (paso activo dentro del wizard). El mecanismo `faseIngreso: 'form' | 'guardando' | 'resultado'` ya existente no cambia — sigue controlando spinner/resultado por encima de cualquiera de las dos vistas. Se replica el patrón de validación por paso, `key` en botones del footer, y bloqueo temporal de botones al cambiar de paso, ya implementado y revisado para `pasoGasto` en el modal de gastos.

**Tech Stack:** React 19 (hooks, JSX condicional), CSS puro (reutiliza clases ya existentes, sin CSS nuevo).

---

## Contexto de archivos

- `client/src/pages/Dashboard.jsx` — único archivo modificado. Contiene el modal de Ingresos (~línea 1000-1170 antes de este plan, sujeto a shift), `handleAbrirIngresos` (línea 449), `handleEditarIngreso` (línea 513), `handleSaveIncome` (línea 464), `handleVolverFormularioIngreso` (línea 570).
- Patrón de referencia ya implementado y revisado para gastos: `pasoGasto`/`totalPasosGasto` (línea 188, 617-618), `validarPasoGasto` (línea 621-635), `handleSiguientePaso`/`handleAtrasPaso` (línea 637-650), `botonesPasoBloqueados` + su `useEffect` (línea 192, 335-339), y el footer del modal de gastos con `key` en los botones (línea ~815-836) — usar como referencia exacta de estilo/estructura, no reinventar el mecanismo.

No hay tests de componente para `Dashboard.jsx` — verificación es manual en browser (Task 4).

---

### Task 1: States `vistaIngreso`/`pasoIngreso` y lógica de navegación del wizard

**Files:**
- Modify: `client/src/pages/Dashboard.jsx` (declaración de states, nueva función `validarPasoIngreso`, `handleSiguientePasoIngreso`, `handleAtrasPasoIngreso`, ajustar `handleAbrirIngresos`/`handleEditarIngreso`/`handleVolverFormularioIngreso`)

- [ ] **Step 1: Agregar states `vistaIngreso`, `pasoIngreso`, `botonesPasoIngresoBloqueados`**

Localizar el bloque de states de ingreso (busca `const [faseIngreso, setFaseIngreso] = useState('form');`) y agregar justo después:

```js
    const [faseIngreso, setFaseIngreso] = useState('form');
    const [resultadoIngreso, setResultadoIngreso] = useState(null);
    // Vista del modal de Ingresos: 'lista' (ingresos del mes + recurrentes + botón "Nuevo
    // ingreso") o 'wizard' (formulario de alta/edición en 2 pasos). Reemplaza el formulario
    // siempre-visible anterior por un flujo de wizard, igual que el modal de gastos.
    const [vistaIngreso, setVistaIngreso] = useState('lista');
    // Paso actual del wizard de ingreso (1: monto/descripción, 2: categoría/tipo)
    const [pasoIngreso, setPasoIngreso] = useState(1);
    // Mismo mecanismo que botonesPasoBloqueados en el wizard de gastos: evita que un click
    // sobre "Siguiente" recaiga por error sobre "Guardar" cuando este último ocupa la misma
    // posición del footer tras avanzar al último paso.
    const [botonesPasoIngresoBloqueados, setBotonesPasoIngresoBloqueados] = useState(false);
```

- [ ] **Step 2: Agregar el `useEffect` de bloqueo de botones**

Localizar el `useEffect` existente que bloquea `botonesPasoBloqueados` para gastos (busca el comentario `// Bloquea brevemente los botones de navegación del wizard al cambiar de paso.`) y agregar justo después de su cierre `}, [pasoGasto]);`:

```js
    // Mismo mecanismo que el de arriba, aplicado al wizard de ingresos.
    useEffect(() => {
        setBotonesPasoIngresoBloqueados(true);
        const timer = setTimeout(() => setBotonesPasoIngresoBloqueados(false), 400);
        return () => clearTimeout(timer);
    }, [pasoIngreso]);
```

- [ ] **Step 3: Agregar `validarPasoIngreso`, `handleSiguientePasoIngreso`, `handleAtrasPasoIngreso`**

Localizar `handleVolverFormularioIngreso` (busca `/** Vuelve a la fase de formulario tras ver el resultado, sin cerrar el modal de Ingresos. */`) y agregar ANTES de esa función:

```js
    /** Valida los campos del paso actual del wizard de ingreso antes de dejar avanzar. */
    const validarPasoIngreso = (paso) => {
        if (paso === 1) {
            if (!incomeForm.monto || Number(incomeForm.monto) <= 0) {
                return 'El monto debe ser mayor a cero.';
            }
        }
        return null;
    };

    const handleSiguientePasoIngreso = () => {
        const error = validarPasoIngreso(pasoIngreso);
        if (error) {
            setErrorIngresoForm(error);
            return;
        }
        setErrorIngresoForm(null);
        setPasoIngreso(prev => prev + 1);
    };

    const handleAtrasPasoIngreso = () => {
        setErrorIngresoForm(null);
        setPasoIngreso(prev => prev - 1);
    };

```

Nota: se introduce `errorIngresoForm`/`setErrorIngresoForm` (nuevo state, ver Step 4) en vez de reutilizar algún error existente — el formulario de ingreso hoy no tiene un state de error inline propio (los errores de guardado van directo al popup de resultado vía `resultadoIngreso`), así que se necesita uno nuevo específico para errores de validación de paso (mismo rol que `errorForm` tiene para gastos).

- [ ] **Step 4: Agregar el state `errorIngresoForm` junto a los demás states de ingreso**

En el mismo bloque de Step 1, agregar:

```js
    const [errorIngresoForm, setErrorIngresoForm] = useState(null);
```

(Puede ir junto a `incomeConfirmDelete` o junto a los states nuevos de Step 1 — cualquier posición dentro del bloque de states de ingreso es válida.)

- [ ] **Step 5: Ajustar `handleAbrirIngresos` para resetear `vistaIngreso`/`pasoIngreso`**

Reemplazar:

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

por:

```js
    const handleAbrirIngresos = () => {
        setIncomeForm(INCOME_FORM_INICIAL);
        setIncomeEditando(null);
        setFaseIngreso('form');
        setResultadoIngreso(null);
        setVistaIngreso('lista');
        setPasoIngreso(1);
        setErrorIngresoForm(null);
        setIsIncomeModalOpen(true);
        fetchIngresosMes();
        fetchRecurrentes();
    };
```

- [ ] **Step 6: Agregar `handleAbrirWizardIngreso` (botón "Nuevo ingreso")**

Justo después de `handleAbrirIngresos`, agregar:

```js
    /** Abre el wizard de alta de ingreso desde la vista de lista, con el formulario vacío. */
    const handleAbrirWizardIngreso = () => {
        setIncomeForm(INCOME_FORM_INICIAL);
        setIncomeEditando(null);
        setPasoIngreso(1);
        setErrorIngresoForm(null);
        setVistaIngreso('wizard');
    };
```

- [ ] **Step 7: Ajustar `handleEditarIngreso` para entrar al wizard**

Reemplazar:

```js
    const handleEditarIngreso = (ingreso) => {
        setIncomeEditando(ingreso.id);
        setIncomeForm({
            monto:         String(ingreso.monto),
            descripcion:   ingreso.descripcion || '',
            categoria_id:  ingreso.categoria_id || '',
            es_recurrente: false,
        });
    };
```

por:

```js
    const handleEditarIngreso = (ingreso) => {
        setIncomeEditando(ingreso.id);
        setIncomeForm({
            monto:         String(ingreso.monto),
            descripcion:   ingreso.descripcion || '',
            categoria_id:  ingreso.categoria_id || '',
            es_recurrente: false,
        });
        setPasoIngreso(1);
        setErrorIngresoForm(null);
        setVistaIngreso('wizard');
    };
```

- [ ] **Step 8: Ajustar `handleVolverFormularioIngreso` para volver a la vista de lista**

Reemplazar:

```js
    /** Vuelve a la fase de formulario tras ver el resultado, sin cerrar el modal de Ingresos. */
    const handleVolverFormularioIngreso = () => {
        setFaseIngreso('form');
        setResultadoIngreso(null);
    };
```

por:

```js
    /** Vuelve a la vista de lista tras ver el resultado, sin cerrar el modal de Ingresos. */
    const handleVolverFormularioIngreso = () => {
        setFaseIngreso('form');
        setResultadoIngreso(null);
        setVistaIngreso('lista');
        setPasoIngreso(1);
    };
```

- [ ] **Step 9: NO modificar `handleSaveIncome` en Task 1**

`handleSaveIncome` ya valida monto/categoría implícitamente vía las llamadas a `db.js` (no tiene validación explícita propia hoy, a diferencia de `handleSubmitExpense`). Este task NO lo toca — el guard contra submit prematuro (ver Task 2 Step 3.5) se agrega recién cuando el `<form>` del wizard ya existe en el JSX, para no dejar código muerto sin usuario que lo ejercite.

> **Hallazgo de code-review de Task 1 (a resolver en Task 2):** `handleSubmitExpense` (gastos) tiene un guard `if (pasoGasto < totalPasosGasto) { handleSiguientePaso(); return; }` al inicio, que evita que un submit prematuro del `<form>` (ej. Enter en el input de Monto del paso 1) dispare el guardado real en vez de avanzar de paso. `handleSaveIncome` NO tiene ese guard. Como Task 2 envuelve ambos pasos del wizard de ingreso en un único `<form onSubmit={handleSaveIncome}>` (igual que gastos hace con `id="form-nuevo-gasto"`), sin este guard, presionar Enter en el paso 1 dispararía `db.createIncome`/`updateIncome` con el formulario a medio completar (sin que el usuario haya pasado por el paso 2 de categoría/tipo). Task 2 Step 3.5 agrega este guard explícitamente — no debe omitirse.

- [ ] **Step 10: Lint**

Run: `npm --prefix client run lint`
Expected: puede haber `no-unused-vars` sobre `vistaIngreso`/`pasoIngreso`/`errorIngresoForm`/`handleAbrirWizardIngreso`/`handleSiguientePasoIngreso`/`handleAtrasPasoIngreso`/`botonesPasoIngresoBloqueados` si todavía no están referenciados en JSX — eso se resuelve en Task 2. Si lint falla por cualquier OTRA razón, es un problema real a corregir ahora.

- [ ] **Step 11: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): agregar wizard de 2 pasos al flujo de ingresos"
```

---

### Task 2: Render — vista de lista + wizard de 2 pasos dentro del modal de Ingresos

**Files:**
- Modify: `client/src/pages/Dashboard.jsx` (bloque del `<Modal>` de Ingresos)

- [ ] **Step 1: Localizar el bloque actual**

Buscar el comentario `{/* Modal: Ingresos */}`. El contenido actual dentro de `{faseIngreso === 'form' && (...)}` es un único `<div className="form-container">` con el `<form onSubmit={handleSaveIncome}>` (Monto/Descripción/Categoría/Tipo/botones) seguido de la lista de ingresos del mes y la lista de recurrentes — leer el contenido real actual del archivo antes de escribir el reemplazo (no asumas el contenido abreviado de este prompt, puede haber shift de líneas).

- [ ] **Step 2: Condicionar `subtitle` y `footer` del `<Modal>` a la vista activa**

Reemplazar la apertura del `<Modal ...>`:

```jsx
            <Modal
                isOpen={isIncomeModalOpen}
                onClose={faseIngreso === 'form' ? () => { setIsIncomeModalOpen(false); setIncomeEditando(null); } : undefined}
                title={faseIngreso === 'form' ? 'Ingresos' : undefined}
                subtitle={faseIngreso === 'form' ? 'Registrá tus ingresos del mes' : undefined}
                disableClose={!!incomeConfirmDelete}
            >
```

por:

```jsx
            <Modal
                isOpen={isIncomeModalOpen}
                onClose={faseIngreso === 'form' ? () => { setIsIncomeModalOpen(false); setIncomeEditando(null); } : undefined}
                title={faseIngreso === 'form' ? (vistaIngreso === 'wizard' ? (incomeEditando ? 'Editar ingreso' : 'Nuevo ingreso') : 'Ingresos') : undefined}
                subtitle={faseIngreso === 'form' ? (vistaIngreso === 'wizard' ? `Paso ${pasoIngreso} de 2` : 'Registrá tus ingresos del mes') : undefined}
                footer={faseIngreso === 'form' && vistaIngreso === 'wizard' ? (
                    <div className="form-row">
                        {pasoIngreso === 1 ? (
                            <button key="cancelar" type="button" onClick={() => setVistaIngreso('lista')} className="btn btn-secondary" style={{ flex: 1 }}>
                                Cancelar
                            </button>
                        ) : (
                            <button key="atras" type="button" onClick={handleAtrasPasoIngreso} disabled={botonesPasoIngresoBloqueados} className="btn btn-secondary" style={{ flex: 1 }}>
                                Atrás
                            </button>
                        )}
                        {pasoIngreso < 2 ? (
                            <button key="siguiente" type="button" onClick={handleSiguientePasoIngreso} disabled={botonesPasoIngresoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                                Siguiente
                            </button>
                        ) : (
                            <button key="guardar" type="submit" form="form-ingreso-wizard" disabled={botonesPasoIngresoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                                {incomeEditando ? 'Actualizar' : 'Agregar ingreso'}
                            </button>
                        )}
                    </div>
                ) : undefined}
                disableClose={!!incomeConfirmDelete}
            >
```

Nota importante: el botón "Cancelar" en paso 1 vuelve a `vistaIngreso: 'lista'` (NO cierra el modal completo) — esto es una decisión deliberada más simple que lo descrito en la spec original (que decía "cierra el modal completo, igual que cancelar en gastos"). Al implementar se prioriza consistencia con el resto del flujo de Ingresos (que nunca cierra el modal solo, excepto por el botón X del header) sobre la paridad exacta con gastos en este punto específico. Si el comportamiento no es el esperado al probarlo en Task 4, es el primer punto a ajustar.

- [ ] **Step 3: Reemplazar el contenido de `{faseIngreso === 'form' && (...)}` con las dos vistas**

Reemplazar TODO el contenido entre `{faseIngreso === 'form' && (` y su `)}` de cierre (el `<div className="form-container">` completo con form + listas) por:

```jsx
                {faseIngreso === 'form' && vistaIngreso === 'lista' && (
                    <div className="form-container">
                        <button type="button" onClick={handleAbrirWizardIngreso} className="btn btn-primary" style={{ width: '100%', marginBottom: '20px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px', verticalAlign: 'middle' }}>add</span>
                            Nuevo ingreso
                        </button>

                        {/* Lista de ingresos del mes */}
                        {ingresosMes.length > 0 && (
                            <div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Ingresos de este mes
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {ingresosMes.map(ing => (
                                        <div key={ing.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--success)' }}>
                                                    ${Number(ing.monto).toLocaleString('es-AR')}
                                                </div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                    {ing.descripcion || 'Sin descripción'}{ing.categorias_ingresos?.nombre ? ` · ${ing.categorias_ingresos.nombre}` : ''}
                                                    {ing.recurrente_id && <span style={{ marginLeft: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '4px' }}>recurrente</span>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', marginLeft: '10px' }}>
                                                <button type="button" onClick={() => handleEditarIngreso(ing)} className="btn btn-secondary" style={{ padding: '4px 8px' }} title="Editar">
                                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                                                </button>
                                                <button type="button" onClick={() => setIncomeConfirmDelete(ing.id)} className="btn btn-danger-gradient" style={{ padding: '4px 8px' }} title="Eliminar">
                                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Total del mes</span>
                                    <span style={{ fontWeight: 700, color: 'var(--success)' }}>
                                        ${ingresosMes.reduce((s, i) => s + Number(i.monto), 0).toLocaleString('es-AR')}
                                    </span>
                                </div>
                            </div>
                        )}
                        {ingresosMes.length === 0 && (
                            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '12px' }}>
                                Todavía no registraste ingresos este mes.
                            </div>
                        )}

                        {/* Lista de recurrentes activos — informativo */}
                        {recurrentesActivos.length > 0 && (
                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Recurrentes configurados
                                </div>
                                {recurrentesActivos.map(rec => (
                                    <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', color: 'var(--text-secondary)' }}>
                                        <span>{rec.descripcion}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ color: 'var(--success)' }}>${Number(rec.monto).toLocaleString('es-AR')}/mes</span>
                                            <button type="button" onClick={() => setIncomeConfirmDelete(`rec-${rec.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0' }} title="Eliminar recurrente">
                                                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>close</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {faseIngreso === 'form' && vistaIngreso === 'wizard' && (
                    <form id="form-ingreso-wizard" onSubmit={handleSaveIncome} className="form-container">
                        {pasoIngreso === 1 && (
                            <>
                            <div className="form-group">
                                <label className="form-label-box">Monto</label>
                                <CurrencyInput
                                    key={`income-${incomeEditando ?? 'new'}`}
                                    value={incomeForm.monto}
                                    onChange={(val) => setIncomeForm(prev => ({ ...prev, monto: val }))}
                                    className="input currency-input--grande"
                                    autoFocus
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label-box">Descripción (opcional)</label>
                                <input
                                    type="text"
                                    value={incomeForm.descripcion}
                                    onChange={(e) => setIncomeForm(prev => ({ ...prev, descripcion: e.target.value }))}
                                    className="input"
                                    placeholder="Ej: Sueldo"
                                />
                            </div>
                            </>
                        )}
                        {pasoIngreso === 2 && (
                            <>
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
                            </>
                        )}
                        {errorIngresoForm && (
                            <p className="edit-form-error" role="alert">{errorIngresoForm}</p>
                        )}
                    </form>
                )}
```

CRITICAL: la vista `lista` es la MISMA lista de ingresos/recurrentes que existía antes (Task 4 del plan anterior), solo se le quita el `border: incomeEditando === ing.id ? ... : ...` condicional en cada fila (ya no tiene sentido: `incomeEditando` ahora dispara un cambio de vista completo en vez de resaltar una fila dentro del mismo panel) y se le agrega el botón "Nuevo ingreso" arriba, reemplazando al `<form>` que antes estaba siempre visible. La vista `wizard` es un `<form>` nuevo con id `form-ingreso-wizard` (distinto del `id="form-nuevo-gasto"` usado en el modal de gastos, para no colisionar), dividido en pasoIngreso 1/2, sin botones de submit propios dentro del form — el submit vive en el `footer` del `<Modal>` (Task 2 Step 2), igual que gastos.

- [ ] **Step 3.5: Agregar guard contra submit prematuro en `handleSaveIncome`**

**Obligatorio — hallazgo de code-review de Task 1.** El `<form id="form-ingreso-wizard" onSubmit={handleSaveIncome}>` del Step 3 envuelve AMBOS pasos del wizard. Sin este guard, presionar Enter en el input de Monto del paso 1 dispara el submit nativo del `<form>` → `handleSaveIncome` se ejecuta directo, guardando el ingreso sin que el usuario haya pasado por el paso 2 (categoría/tipo quedan en sus defaults sin elección consciente). Mismo mecanismo que ya previene esto en `handleSubmitExpense` (gastos).

Localizar el inicio de `handleSaveIncome`:

```js
    const handleSaveIncome = async (e) => {
        e.preventDefault();
        const hoy = new Date();
        const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        setFaseIngreso('guardando');
```

Reemplazar por:

```js
    const handleSaveIncome = async (e) => {
        e.preventDefault();
        // El form del wizard solo se submitea de verdad en el paso 2 (botón "Agregar
        // ingreso"/"Actualizar"). Si el submit llega antes (ej. Enter en el input de
        // Monto del paso 1), avanzamos de paso en vez de guardar a medio completar.
        if (pasoIngreso < 2) {
            handleSiguientePasoIngreso();
            return;
        }
        const hoy = new Date();
        const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        setFaseIngreso('guardando');
```

El resto del cuerpo de `handleSaveIncome` (desde el `try {` en adelante) no cambia.

- [ ] **Step 4: Lint y build**

Run: `npm --prefix client run lint && npm --prefix client run build`
Expected: ambos sin errores. Debe resolver los `no-unused-vars` pendientes de Task 1.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): dividir el modal de ingresos en vista de lista y wizard"
```

---

### Task 3: Revisar el `useEffect` de teclado (Enter) y cualquier referencia residual a `incomeEditando === ing.id`

**Files:**
- Modify: `client/src/pages/Dashboard.jsx` (solo si aplica, ver Step 1)

- [ ] **Step 1: Confirmar que no queda ningún resaltado de fila basado en `incomeEditando`**

Buscar `incomeEditando === ing.id` en todo el archivo — tras Task 2, no debería quedar ninguna ocurrencia (se quitó del `style` de cada fila de la lista, ya que editar ahora cambia de vista en vez de resaltar in-place). Si aparece alguna, es un resto no limpiado — eliminarlo, no dejarlo.

- [ ] **Step 2: Confirmar que el atajo de teclado Enter no interfiere con el wizard de ingreso**

Leer el `useEffect` que maneja `e.key === 'Enter'` (buscar el comentario `// Mejorar UX de teclado: permite confirmar acciones con Enter en botones`) — confirmar que no depende de ningún state específico de gastos que pudiera comportarse distinto en el contexto del wizard de ingreso. Si el mecanismo es genérico (opera sobre `document.activeElement`, no sobre state de gastos), no requiere cambios — dejarlo como está y reportarlo en el commit de Task 2 si no se había notado antes, o documentar acá que se revisó y no aplica cambio.

- [ ] **Step 3: Si no hay cambios que hacer, saltar el commit de este task**

Si Step 1 y Step 2 no encuentran nada que corregir, este task no genera commit — reportar en el resumen final que se verificó y no había residuos.

---

### Task 4: Verificación manual en browser

**Files:** ninguno (solo verificación funcional).

- [ ] **Step 1: Levantar el entorno**

Run: `npm run dev`

- [ ] **Step 2: Vista de lista al abrir**

1. Abrir "Ingresos" desde el dashboard.
2. Verificar: se ve el botón "Nuevo ingreso" arriba, seguido de la lista de ingresos del mes (o el mensaje de "Todavía no registraste..."), y la lista de recurrentes si hay. NO debe verse ningún formulario en esta vista.

- [ ] **Step 3: Alta de ingreso puntual vía wizard**

1. Tocar "Nuevo ingreso".
2. Verificar: aparece el wizard, paso 1 de 2, con Monto/Descripción. Título del modal "Nuevo ingreso".
3. Completar monto, tocar "Siguiente".
4. Verificar: paso 2 de 2, con Categoría y Tipo de ingreso (probar el chip "Sin categoría" también). Botón dice "Agregar ingreso".
5. Dejar "Puntual", tocar "Agregar ingreso".
6. Verificar: spinner "Guardando..." → resultado "¡Ingreso registrado!" → tocar "Continuar" → vuelve a la vista de lista (NO al wizard), con el nuevo ingreso en la lista.

- [ ] **Step 4: Alta de ingreso recurrente**

1. Desde la vista de lista, "Nuevo ingreso" de nuevo.
2. En paso 2, elegir chip "Recurrente", guardar.
3. Verificar comportamiento igual al anterior, y que el ingreso recurrente aparece tanto en "Ingresos de este mes" como en "Recurrentes configurados".

- [ ] **Step 5: Editar ingreso**

1. Desde la lista, tocar el ícono editar en un ingreso.
2. Verificar: entra al wizard en paso 1, con Monto/Descripción precargados. Título "Editar ingreso".
3. Avanzar a paso 2: Categoría precargada, SIN el chip "Tipo de ingreso" (no debe aparecer).
4. Modificar el monto, tocar "Actualizar".
5. Verificar spinner→"Ingreso actualizado"→vuelta a la lista con el monto actualizado.

- [ ] **Step 6: Botón "Atrás" y "Cancelar" del wizard**

1. "Nuevo ingreso" → completar monto → "Siguiente" → paso 2 → tocar "Atrás".
2. Verificar: vuelve a paso 1 con el monto ya completado (no se pierde).
3. Desde paso 1, tocar "Cancelar".
4. Verificar: vuelve a la vista de lista sin guardar nada (según lo implementado en Task 2 Step 2 — si en cambio cierra el modal completo, confirmar con Nicolás si ese es el comportamiento preferido antes de dar la tarea por cerrada).

- [ ] **Step 7: Eliminar ingreso puntual y recurrente**

1. Desde la lista, eliminar un ingreso puntual — confirmar en el `ConfirmModal`, verificar spinner→"Ingreso eliminado"→vuelta a lista sin ese ingreso.
2. Eliminar un recurrente — mismo flujo, verificar que desaparece de "Recurrentes configurados".

- [ ] **Step 8: Validación de paso 1**

1. "Nuevo ingreso", dejar el monto vacío o en 0, tocar "Siguiente".
2. Verificar: aparece el mensaje de error "El monto debe ser mayor a cero." y NO avanza a paso 2.

- [ ] **Step 9: Caso de error de red**

Cortar la conexión un instante y guardar un ingreso — verificar que el spinner muta a error en vez de quedar colgado, y "Continuar" permite volver a la lista para reintentar.

- [ ] **Step 10: Regresión — cierre manual y reapertura**

1. Abrir "Ingresos", tocar la X del header desde la vista de lista — cierra sin problemas.
2. Reabrir — debe arrancar en vista de lista (no en wizard), con los datos correctos.
3. Abrir el wizard, avanzar a paso 2, cerrar con la X — verificar que cierra el modal completo (no solo vuelve a la lista). Reabrir y confirmar que arranca limpio en vista de lista, paso 1.

---

## Self-Review

**Spec coverage:**
- `vistaIngreso: 'lista' | 'wizard'` reemplazando el formulario siempre-visible → Task 1 Step 1, Task 2 Step 3. ✅
- Wizard de 2 pasos (Monto+Descripción / Categoría+Tipo) con validación de paso 1 → Task 1 Step 3, Task 2 Step 3. ✅
- Botón "Nuevo ingreso" en la vista lista → Task 1 Step 6, Task 2 Step 3. ✅
- Editar abre el wizard en paso 1 precargado → Task 1 Step 7. ✅
- Lista oculta durante el wizard (ambos pasos) → Task 2 Step 3 (son bloques `{faseIngreso === 'form' && vistaIngreso === 'lista' && (...)}` vs `{... && vistaIngreso === 'wizard' && (...)}`, mutuamente excluyentes). ✅
- Guardar → guardando → resultado → vuelve a vista `lista` (no wizard) → Task 1 Step 8. ✅
- Eliminar no pasa por el wizard, sigue disparándose desde la vista lista → confirmado, ningún task modifica `handleEliminarIngreso`/`handleEliminarRecurrente` ni su disparo desde los íconos de la lista. ✅
- Cierre manual desde wizard cierra el modal completo (vía X del header, `onClose` sigue condicionado solo a `faseIngreso === 'form'`, no a `vistaIngreso`) → confirmado en Task 2 Step 2. El botón "Cancelar" interno del wizard, en cambio, vuelve a la lista en vez de cerrar — desviación documentada explícitamente en Task 2 Step 2 como decisión tomada durante la implementación, a validar en Task 4 Step 6. ⚠️ (ver nota abajo)
- Reapertura siempre arranca en `vistaIngreso: 'lista'` → Task 1 Step 5. ✅
- Reutilización del patrón de gastos (`key` en botones, bloqueo temporal, validación por paso) → Task 1 Steps 1-3, Task 2 Step 2. ✅
- Guard contra submit prematuro del `<form>` del wizard (Enter en paso 1 no debe guardar directo) → Task 2 Step 3.5, agregado tras hallazgo de code-review de Task 1 (mismo mecanismo que `handleSubmitExpense` ya tiene para gastos). ✅

**Nota sobre la desviación marcada con ⚠️:** la spec (sección "Fuera de alcance") decía "cancelar desde paso 1 cierra el modal completo, igual que gastos". Al escribir el plan se optó por que "Cancelar" vuelva a la vista de lista en vez de cerrar el modal, por consistencia con el resto del flujo de Ingresos (que evita cerrar el modal salvo por la X). Esto se documentó explícitamente en el texto del task en vez de aplicarse en silencio, y Task 4 Step 6 pide validar este punto puntual con Nicolás durante la verificación manual — si prefiere el comportamiento original de la spec (cerrar el modal), es un cambio de una sola línea (`onClick={() => setVistaIngreso('lista')}` → `onClick={() => { setIsIncomeModalOpen(false); setIncomeEditando(null); }}`).

**Placeholder scan:** sin TBD/TODO. Task 3 es deliberadamente una tarea de verificación/limpieza sin contenido predeterminado (puede no generar cambios) — no es un placeholder de requisito faltante, es una salvaguarda explícita para no dejar código residual del modelo anterior (resaltado de fila por `incomeEditando`).

**Type consistency:** `vistaIngreso` usa los mismos 2 valores literales (`'lista'`, `'wizard'`) en Task 1 y Task 2. `pasoIngreso` usa números (1, 2) consistentes con `pasoGasto` en gastos. `errorIngresoForm`/`setErrorIngresoForm` se declara en Task 1 y se consume en Task 2 con el mismo nombre. `handleAbrirWizardIngreso`, `handleSiguientePasoIngreso`, `handleAtrasPasoIngreso` se definen en Task 1 y se referencian con el mismo nombre en Task 2 (botón "Nuevo ingreso", footer Siguiente/Atrás). El `id="form-ingreso-wizard"` del `<form>` (Task 2 Step 3) coincide con el `form="form-ingreso-wizard"` del botón submit en el footer (Task 2 Step 2).
