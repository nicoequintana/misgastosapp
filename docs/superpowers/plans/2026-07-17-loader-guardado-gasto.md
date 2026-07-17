# Loader de guardado en el modal de nuevo gasto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el ciclo actual "cerrar modal wizard → abrir modal ResultModal" por una única fase de modal que muta entre formulario, spinner de guardado, y resultado, sin cierre/apertura perceptible entre medio.

**Architecture:** Se introduce un state `faseGasto` (`'form' | 'guardando' | 'resultado'`) en `Dashboard.jsx` que controla qué se renderiza dentro del `<Modal isOpen={isModalOpen}>` ya existente. El `ResultModal` separado deja de usarse en el flujo de alta de gasto (Movements.jsx sigue usándolo sin cambios). `handleSubmitExpense` pasa por `faseGasto('guardando')` antes del `await db.createExpense`, y por `faseGasto('resultado')` al resolver (éxito o error). El cierre real del modal (`setIsModalOpen(false)` + reset de form/paso/fase) ocurre solo cuando el usuario confirma el popup de resultado.

**Tech Stack:** React 19 (hooks, JSX condicional), CSS puro (glassmorphism, `@keyframes`).

---

## Contexto de archivos

- `client/src/pages/Dashboard.jsx` — componente principal, contiene el modal de alta de gasto (líneas ~753-907 aprox., sujeto a shift por ediciones previas de esta sesión).
- `client/src/components/Modal.jsx` — modal base genérico, ya soporta `title`/`subtitle`/`footer` opcionales (no requiere cambios).
- `client/src/components/ResultModal.jsx` — componente de popup de resultado, **no se modifica**, sigue usándose en `Movements.jsx`.
- `client/src/index.css` — estilos `.result-modal*` ya existentes (líneas 8292-8349), se reutilizan las mismas clases para el spinner y el resultado inline.

No hay suite de tests de componente para `Dashboard.jsx` (requiere mocks pesados de Supabase/contexts) — verificación de este plan es manual en browser, siguiendo el patrón ya usado en el fix anterior de este mismo módulo.

---

### Task 1: Agregar estilos de spinner de guardado

**Files:**
- Modify: `client/src/index.css:8349` (después del bloque `.result-modal__boton--error`)

- [ ] **Step 1: Agregar la clase de ícono giratorio y su animación**

Insertar inmediatamente después de la línea 8349 (`}` que cierra `.result-modal__boton--error`):

```css

.result-modal__icono--loading {
  animation: result-modal-icono-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both,
             result-modal-girar 1s linear infinite;
}

@keyframes result-modal-girar {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.result-modal__subtexto {
  font-size: 14px;
  color: var(--text-secondary);
  margin: calc(var(--space-8) * -1 + var(--space-2)) 0 var(--space-2);
  animation: result-modal-fade-up 0.35s ease-out 0.1s both;
}
```

- [ ] **Step 2: Verificar que el archivo sigue siendo CSS válido**

Run: `npm --prefix client run build`
Expected: build termina sin errores (un CSS roto rompe el build de Vite).

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "style(dashboard): agregar estilos de spinner para guardado de gasto"
```

---

### Task 2: Introducir el state `faseGasto` y reordenar `handleSubmitExpense`

**Files:**
- Modify: `client/src/pages/Dashboard.jsx:196` (declaración de state, junto a `resultadoGasto`)
- Modify: `client/src/pages/Dashboard.jsx:341-414` (`handleSubmitExpense`)
- Modify: `client/src/pages/Dashboard.jsx:554-557` (`handleAbrirNuevoGasto`)

- [ ] **Step 1: Agregar el state `faseGasto` junto a `resultadoGasto`**

En la línea 196, reemplazar:

```js
    // Popup de resultado inmediato tras crear el gasto (éxito o error) — convive con
    // el historial persistente de NotificacionesContext, no lo reemplaza.
    const [resultadoGasto, setResultadoGasto] = useState(null);
```

por:

```js
    // Popup de resultado inmediato tras crear el gasto (éxito o error) — convive con
    // el historial persistente de NotificacionesContext, no lo reemplaza.
    const [resultadoGasto, setResultadoGasto] = useState(null);
    // Fase visual del modal de alta de gasto: 'form' (wizard), 'guardando' (spinner
    // mientras corre createExpense) o 'resultado' (popup de éxito/error). Todo dentro
    // del mismo modal para evitar el corte de cerrar+abrir dos modales distintos.
    const [faseGasto, setFaseGasto] = useState('form');
```

- [ ] **Step 2: Reordenar `handleSubmitExpense` para pasar por la fase `guardando` y `resultado`**

Reemplazar el bloque completo de la línea 341 a 414:

```js
    const handleSubmitExpense = async (e) => {
        e.preventDefault();
        setErrorForm(null);

        // El form del wizard solo se submitea de verdad en el último paso (botón "Guardar").
        // Si el submit llega antes (ej. Enter en un campo de un paso intermedio), avanzamos
        // de paso en vez de guardar el gasto a medio completar.
        if (pasoGasto < totalPasosGasto) {
            handleSiguientePaso();
            return;
        }

        // Validar que todos los campos requeridos estén completos (la descripción es opcional)
        if (!expenseForm.monto || Number(expenseForm.monto) <= 0) {
            setErrorForm('El monto debe ser mayor a cero.');
            return;
        }

        if (!expenseForm.id_categoria) {
            setErrorForm('Seleccioná una categoría.');
            return;
        }

        if (!expenseForm.id_metodo_pago) {
            setErrorForm('Seleccioná un método de pago.');
            return;
        }

        if ((expenseForm.esTarjetaCredito || expenseForm.esPrestamo) && !expenseForm.primeraCuota) {
            setErrorForm('Indicá en qué mes vence la primera cuota.');
            return;
        }

        // A partir de acá el form es válido: mostramos el spinner en el mismo modal
        // en vez de cerrar el wizard y abrir un popup aparte.
        setFaseGasto('guardando');

        try {
            // La descripción es opcional: si el usuario no escribió nada, usamos un texto genérico
            // para la notificación (la persistencia del default real ocurre en db.createExpense).
            const descripcionMostrada = expenseForm.descripcion?.trim() || 'SIN DESCRIPCIÓN';
            // La fecha del gasto siempre es la del día de carga — no es un campo editable del form.
            // Se recalcula acá (no solo en el estado inicial) por si el modal quedó abierto de un día para el otro.
            await db.createExpense({ ...expenseForm, fecha: fechaHoyArgentina() });
            console.log('✅ Gasto creado correctamente');
            agregarNotificacion({
                titulo:  'Gasto registrado',
                mensaje: `Se registró "${descripcionMostrada}" por $${Number(expenseForm.monto).toLocaleString('es-AR')}.`,
                tipo:    'success',
                origen:  'manual',
            });
            setResultadoGasto({ tipo: 'success', titulo: '¡Gasto registrado!' });
            setFaseGasto('resultado');
            // Verificar si el gasto supera el umbral de gasto alto
            verificarAlertaGastoAlto({ descripcion: descripcionMostrada, monto: expenseForm.monto });
            // Recargar cuotas si el nuevo gasto es con tarjeta de crédito
            if (expenseForm.esTarjetaCredito) {
                Promise.all([getTarjetasEnCuotas(), getGastosFuturos()])
                    .then(([cuotas, futuros]) => { setCuotasGrupos(cuotas); setGastosFuturos(futuros); })
                    .catch(console.error);
            }
            // Recargar préstamos si el nuevo gasto es de categoría PRESTAMOS
            if (expenseForm.esPrestamo) {
                Promise.all([getPrestamosEnCuotas(), getPrestamosGastosFuturos()])
                    .then(([prest, prestFut]) => { setPrestamosGrupos(prest); setPrestamosFuturos(prestFut); })
                    .catch(console.error);
            }
            // Al recargar stats verificamos alertas de saldo y porcentaje
            await fetchStats({ verificarAlertas: true });
        } catch (err) {
            console.error('❌ Error al guardar gasto:', err);
            setResultadoGasto({ tipo: 'error', titulo: 'No se pudo guardar el gasto', mensaje: err.message });
            setFaseGasto('resultado');
        }
    };

    /** Cierra el modal de alta de gasto y resetea wizard, formulario y fase a su estado inicial. */
    const handleCerrarModalGasto = () => {
        setIsModalOpen(false);
        setErrorForm(null);
        setExpenseForm(ESTADO_INICIAL_GASTO);
        setPasoGasto(1);
        setFaseGasto('form');
        setResultadoGasto(null);
    };
```

Nota: se quitó `setIsModalOpen(false)` y `setExpenseForm(ESTADO_INICIAL_GASTO)`/`setErrorForm(null)` del bloque de éxito de `try` — ahora viven en `handleCerrarModalGasto`, que se invoca al confirmar el popup de resultado (Task 3). Se quitó también `setErrorForm(err.message ...)` del `catch` porque el mensaje de error ahora se muestra en el popup de resultado (`resultadoGasto.mensaje`), no como texto de validación del form.

- [ ] **Step 3: Verificar que `ESTADO_INICIAL_GASTO` sigue siendo el import/const correcto**

`ESTADO_INICIAL_GASTO` ya está declarado como constante de módulo en la línea 22 — no requiere import adicional, solo confirmar que el nombre coincide exactamente (ya usado en la línea 186 del `useState` inicial).

Run: `npm --prefix client run lint`
Expected: sin errores de `no-undef` sobre `ESTADO_INICIAL_GASTO` ni `handleCerrarModalGasto`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): agregar fase de guardado al modal de nuevo gasto"
```

---

### Task 3: Render condicional por fase dentro del modal único

**Files:**
- Modify: `client/src/pages/Dashboard.jsx` (bloque del `<Modal>` de alta de gasto, ~línea 753-907 antes de esta tarea; puede variar levemente por la Task 2)

- [ ] **Step 1: Localizar el bloque actual del modal**

Buscar el comentario `{/* Modal: Nuevo Gasto (wizard de 3 pasos...`. El bloque actual (antes de este cambio) es:

```jsx
            <Modal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setErrorForm(null); }}
                title="Nuevo Gasto"
                subtitle={`Paso ${pasoGasto} de ${totalPasosGasto}`}
                footer={
                    <div className="form-row">
                        {pasoGasto === 1 ? (
                            <button key="cancelar" type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                                Cancelar
                            </button>
                        ) : (
                            <button key="atras" type="button" onClick={handleAtrasPaso} disabled={botonesPasoBloqueados} className="btn btn-secondary" style={{ flex: 1 }}>
                                Atrás
                            </button>
                        )}
                        {pasoGasto < totalPasosGasto ? (
                            <button key="siguiente" type="button" onClick={handleSiguientePaso} disabled={botonesPasoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                                Siguiente
                            </button>
                        ) : (
                            <button key="guardar" type="submit" form="form-nuevo-gasto" disabled={botonesPasoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                                Guardar
                            </button>
                        )}
                    </div>
                }
            >
                <form id="form-nuevo-gasto" onSubmit={handleSubmitExpense} className="form-container">
                    {/* ... pasos 1, 2, 3 del wizard ... */}
                    {errorForm && (
                        <p className="edit-form-error" role="alert">{errorForm}</p>
                    )}
                </form>
            </Modal>
```

- [ ] **Step 2: Reemplazar `isOpen`/`onClose`/`title`/`subtitle`/`footer` para que dependan de `faseGasto`**

Reemplazar la apertura del `<Modal ...>` (props hasta el `>` antes de los children) por:

```jsx
            <Modal
                isOpen={isModalOpen}
                onClose={faseGasto === 'form' ? handleCerrarModalGasto : undefined}
                title={faseGasto === 'form' ? 'Nuevo Gasto' : undefined}
                subtitle={faseGasto === 'form' ? `Paso ${pasoGasto} de ${totalPasosGasto}` : undefined}
                footer={faseGasto === 'form' ? (
                    <div className="form-row">
                        {pasoGasto === 1 ? (
                            <button key="cancelar" type="button" onClick={handleCerrarModalGasto} className="btn btn-secondary" style={{ flex: 1 }}>
                                Cancelar
                            </button>
                        ) : (
                            <button key="atras" type="button" onClick={handleAtrasPaso} disabled={botonesPasoBloqueados} className="btn btn-secondary" style={{ flex: 1 }}>
                                Atrás
                            </button>
                        )}
                        {pasoGasto < totalPasosGasto ? (
                            <button key="siguiente" type="button" onClick={handleSiguientePaso} disabled={botonesPasoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                                Siguiente
                            </button>
                        ) : (
                            <button key="guardar" type="submit" form="form-nuevo-gasto" disabled={botonesPasoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                                Guardar
                            </button>
                        )}
                    </div>
                ) : undefined}
            >
```

Nota: `onClose` pasa a `handleCerrarModalGasto` (antes era una función inline que no reseteaba `expenseForm`/`pasoGasto` — ese reset vivía parcialmente en el bloque de éxito de `handleSubmitExpense`. Ahora está centralizado en `handleCerrarModalGasto`, ver Task 2). Durante `guardando`/`resultado`, `onClose` es `undefined` para que el usuario no pueda cerrar el modal a mitad del guardado tocando la X o el fondo (mismo comportamiento que ya existe hoy en `Modal.jsx` cuando `onClose` es falsy: no renderiza el botón de cierre y el click en el overlay no hace nada, ver `Modal.jsx:11`).

- [ ] **Step 3: Envolver el `<form>` del wizard en el render condicional de fase, y agregar las fases `guardando`/`resultado`**

Reemplazar el children del `<Modal>` (todo lo que hoy está entre `>` y `</Modal>`) por:

```jsx
                {faseGasto === 'form' && (
                    <form id="form-nuevo-gasto" onSubmit={handleSubmitExpense} className="form-container">
                        {pasoGasto === 1 && (
                            <>
                            <div className="form-group">
                                <label className="form-label-box">Monto</label>
                                <CurrencyInput
                                    value={expenseForm.monto}
                                    onChange={(val) => setExpenseForm(prev => ({ ...prev, monto: val }))}
                                    className="input currency-input--grande"
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label-box">Descripción (opcional)</label>
                                <input
                                    type="text"
                                    value={expenseForm.descripcion}
                                    onChange={(e) => setExpenseForm(prev => ({ ...prev, descripcion: e.target.value }))}
                                    className="input"
                                />
                            </div>
                            </>
                        )}
                        {pasoGasto === 2 && (
                            <>
                            <div className="form-group">
                                <label className="form-label-box">Categoría</label>
                                <ChipSelector
                                    opciones={categories}
                                    valorSeleccionado={expenseForm.id_categoria ? Number(expenseForm.id_categoria) : null}
                                    onChange={(id) => handleCambioCategoria(id)}
                                    limiteVisible={6}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label-box">Método de Pago</label>
                                <ChipSelector
                                    opciones={paymentMethods}
                                    valorSeleccionado={expenseForm.id_metodo_pago ? Number(expenseForm.id_metodo_pago) : null}
                                    onChange={(id) => handleCambioMetodoPago(id)}
                                    limiteVisible={6}
                                />
                            </div>
                            {expenseForm.esTarjetaCredito && (
                                <>
                                <div className="form-group">
                                    <label className="form-label-box">Cuotas</label>
                                    <select
                                        value={expenseForm.cuotas}
                                        onChange={(e) => setExpenseForm(prev => ({ ...prev, cuotas: parseInt(e.target.value) }))}
                                        className="form-select"
                                    >
                                        {OPCIONES_CUOTAS_TARJETA.map(n => (
                                            <option key={n} value={n}>
                                                {n === 1 ? '1 cuota (pago único)' : `${n} cuotas`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label-box">Mes de la primera cuota <span style={{ color: 'var(--danger)' }}>*</span></label>
                                    <input
                                        type="month"
                                        className="form-select"
                                        value={expenseForm.primeraCuota}
                                        onChange={(e) => setExpenseForm(prev => ({ ...prev, primeraCuota: e.target.value }))}
                                        required
                                    />
                                    <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                                        El 1° del mes elegido es la fecha de vencimiento de la primera cuota.
                                    </small>
                                </div>
                                </>
                            )}
                            {expenseForm.esPrestamo && (
                                <>
                                <div className="form-group">
                                    <label className="form-label-box">Cuotas</label>
                                    <select
                                        value={expenseForm.cuotas}
                                        onChange={(e) => setExpenseForm(prev => ({ ...prev, cuotas: parseInt(e.target.value) }))}
                                        className="form-select"
                                    >
                                        {OPCIONES_CUOTAS_PRESTAMO.map(n => (
                                            <option key={n} value={n}>
                                                {n === 1 ? '1 cuota (pago único)' : `${n} cuotas`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label-box">Mes del primer pago <span style={{ color: 'var(--danger)' }}>*</span></label>
                                    <input
                                        type="month"
                                        className="form-select"
                                        value={expenseForm.primeraCuota}
                                        onChange={(e) => setExpenseForm(prev => ({ ...prev, primeraCuota: e.target.value }))}
                                        required
                                    />
                                    <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                                        El 1° del mes elegido es la fecha del primer pago del préstamo.
                                    </small>
                                </div>
                                </>
                            )}
                            </>
                        )}
                        {pasoGasto === 3 && aplicaPasoFijoVariable && (
                            <div className="form-group">
                                <label className="form-label-box">Tipo de gasto</label>
                                <ChipSelector
                                    opciones={[
                                        { id: 'variable', nombre: 'Variable', icono: 'trending_down' },
                                        { id: 'fijo', nombre: 'Fijo', icono: 'lock' },
                                    ]}
                                    valorSeleccionado={expenseForm.es_fijo ? 'fijo' : 'variable'}
                                    onChange={(id) => setExpenseForm(prev => ({ ...prev, es_fijo: id === 'fijo' }))}
                                    limiteVisible={2}
                                />
                            </div>
                        )}
                        {errorForm && (
                            <p className="edit-form-error" role="alert">{errorForm}</p>
                        )}
                    </form>
                )}
                {faseGasto === 'guardando' && (
                    <div className="result-modal">
                        <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                            progress_activity
                        </span>
                        <h3 className="result-modal__titulo">Guardando gasto...</h3>
                    </div>
                )}
                {faseGasto === 'resultado' && resultadoGasto && (
                    <div className="result-modal">
                        <span
                            className="material-symbols-outlined result-modal__icono"
                            style={{
                                color: resultadoGasto.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                                borderColor: resultadoGasto.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                            }}
                        >
                            {resultadoGasto.tipo === 'error' ? 'cancel' : 'check_circle'}
                        </span>
                        <h3 className="result-modal__titulo">{resultadoGasto.titulo}</h3>
                        {resultadoGasto.mensaje && (
                            <p className="result-modal__subtexto">{resultadoGasto.mensaje}</p>
                        )}
                        <button
                            type="button"
                            className={`btn result-modal__boton result-modal__boton--${resultadoGasto.tipo === 'error' ? 'error' : 'success'}`}
                            onClick={handleCerrarModalGasto}
                        >
                            Continuar
                        </button>
                    </div>
                )}
            </Modal>
```

- [ ] **Step 4: Lint y build**

Run: `npm --prefix client run lint && npm --prefix client run build`
Expected: ambos sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): mostrar spinner y resultado dentro del mismo modal al guardar gasto"
```

---

### Task 4: Verificación manual en browser

**Files:** ninguno (solo verificación funcional).

- [ ] **Step 1: Levantar el entorno**

Run: `npm run dev`

- [ ] **Step 2: Caso gasto sin cuotas (wizard de 3 pasos)**

1. Abrir "Nuevo Gasto".
2. Completar monto, avanzar.
3. Elegir categoría normal + método de pago sin `acepta_cuotas`, avanzar.
4. En paso 3, elegir Fijo/Variable, tocar "Guardar".
5. Verificar: aparece spinner "Guardando gasto..." centrado, sin header ni botones, inmediatamente después de tocar "Guardar" (sin que el modal se cierre antes).
6. Verificar: al resolver, el mismo modal muta a ícono de check verde + "¡Gasto registrado!" + botón "Continuar", sin parpadeo de cierre/apertura.
7. Tocar "Continuar" — el modal se cierra. Reabrir "Nuevo Gasto" y confirmar que el wizard arranca limpio en paso 1 (regresión del reset de `ESTADO_INICIAL_GASTO`).

- [ ] **Step 3: Caso gasto con tarjeta (cuotas, wizard de 2 pasos)**

1. Abrir "Nuevo Gasto", completar monto, avanzar.
2. Elegir método de pago con `acepta_cuotas=true`, completar cuotas + mes de primera cuota, tocar "Guardar" (paso 2, último paso).
3. Verificar mismo comportamiento de spinner → resultado sin cierre intermedio.

- [ ] **Step 4: Caso de error (simular fallo de guardado)**

Con la consola de red del browser, cortar la conexión a Supabase temporalmente (o desconectar wifi un instante) y tocar "Guardar":
1. Verificar que el spinner aparece igual.
2. Verificar que al fallar, el modal muta a ícono de error (cancel, rojo) + título "No se pudo guardar el gasto" + mensaje del error + botón "Continuar" (no queda colgado en el spinner).
3. Tocar "Continuar" y verificar que el wizard vuelve a paso 1 con el form limpio, permitiendo reintentar.

- [ ] **Step 5: Regresión de cierre manual (botón Cancelar / click fuera / X)**

1. Abrir "Nuevo Gasto", en paso 1 tocar "Cancelar" — el modal debe cerrar sin guardar nada.
2. Abrir de nuevo, avanzar a paso 2, tocar la X del header — debe cerrar sin guardar.
3. Confirmar que ninguna de estas acciones es posible mientras `faseGasto` es `'guardando'` (no debe haber X visible ni click-fuera-cierra durante el spinner).

---

## Self-Review

**Spec coverage:**
- Nuevo state `faseGasto` con 3 valores → Task 2, Step 1. ✅
- Flujo de `handleSubmitExpense` (guardando antes del await, resultado en éxito/error, cierre solo al confirmar popup) → Task 2, Step 2. ✅
- Render del modal único por fase (header/footer solo en `form`, spinner sin header/footer, resultado sin header/footer) → Task 3. ✅
- Spinner reutilizando clases `result-modal` + animación de rotación → Task 1 + Task 3, Step 3. ✅
- `ResultModal.jsx` sin cambios, `Movements.jsx` sin cambios → confirmado, ningún task los modifica. ✅
- Modal.jsx sin cambios de lógica → confirmado, ningún task lo modifica. ✅

**Placeholder scan:** sin TBD/TODO, todo el código de cada step es completo y copiable tal cual.

**Type consistency:** `faseGasto` usa los mismos 3 strings literales (`'form'`, `'guardando'`, `'resultado'`) en Task 2 y Task 3. `handleCerrarModalGasto` se define en Task 2 y se referencia igual en Task 3 (footer, onClose, botón Cancelar, botón Continuar). `resultadoGasto` mantiene su shape `{ tipo, titulo }` existente, extendido con `mensaje` opcional (usado solo en el caso error) — consistente entre Task 2 (donde se setea) y Task 3 (donde se lee).
