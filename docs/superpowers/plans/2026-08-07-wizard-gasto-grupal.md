# Wizard de gasto grupal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la página larga de carga de gasto grupal (`GrupoGastoNuevo.jsx`) por un modal wizard de 5 pasos, con la misma estética y patrón de navegación que `GastoWizard.jsx` (gasto personal).

**Architecture:** Nuevo componente `GrupoGastoWizard.jsx` que envuelve `Modal` y reutiliza `useGrupoGastoForm` (modo `'crear'`) sin modificar su contrato. El paso actual del wizard (`pasoGasto`) se maneja localmente en el componente, igual que hace `GastoWizard`. Se elimina `GrupoGastoNuevo.jsx`, su test, y la ruta `/grupos/:id/gastos/nuevo`. `GrupoGastoEditar.jsx` y `GrupoGastoForm.jsx` no se tocan.

**Tech Stack:** React 19, Vitest + Testing Library, componentes existentes (`Modal`, `ChipSelector`, `CurrencyInput`, `MiembrosSelector`, `ResultModal`).

---

## Contexto para quien ejecute este plan

- El hook `useGrupoGastoForm` (`client/src/hooks/useGrupoGastoForm.js`) ya expone todo el estado, validación on-blur y `handleSubmit`/`volverAFormulario` necesarios. **No se modifica.**
- El campo `fecha` deja de mostrarse en el wizard nuevo. Esto es seguro porque en modo `'crear'` el hook inicializa `fecha` con `fechaHoyArgentina()` (línea 29 del hook) — la validación `validar()` (que exige `fecha` no vacía) pasa sola sin que el wizard necesite tocarla.
- La descripción SÍ es obligatoria en el wizard grupal (a diferencia del wizard personal, donde es opcional). Esto ya está validado por el hook (`validar()` línea ~179: `if (!descripcion.trim()) return '...'`).
- El componente `Modal` (`client/src/components/Modal.jsx`) acepta `isOpen`, `onClose`, `title`, `subtitle`, `footer`, `children`, `disableClose`.
- `ChipSelector` requiere `opciones` con forma `{id, nombre, icono}`.
- `ResultModal` con prop `bare` renderiza solo el contenido sin su propio `<Modal>` — así se anida como fase dentro del wizard, igual que en `GastoWizard.jsx:472-484`.

---

### Task 1: Crear `GrupoGastoWizard.jsx` — esqueleto y pasos 1-2

**Files:**
- Create: `client/src/components/grupos/GrupoGastoWizard.jsx`
- Test: `client/src/components/grupos/GrupoGastoWizard.test.jsx`

- [ ] **Step 1: Escribir el test que verifica el paso 1 (monto/descripción) y su validación**

```jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GrupoGastoWizard from './GrupoGastoWizard';
import { AuthContext } from '../../context/AuthContext';
import * as db from '../../lib/db';

vi.mock('../../lib/db');

const MIEMBROS = [
    { user_id: 'u1', estado: 'activo', alias: 'Nico' },
    { user_id: 'u2', estado: 'activo', alias: 'Ana' },
];
const CATEGORIAS = [
    { id: 1, nombre: 'COMIDA', icono: 'restaurant', es_propia: false },
];
const METODOS_PAGO = [
    { id: 10, nombre: 'EFECTIVO', icono: 'payments', acepta_cuotas: false },
    { id: 20, nombre: 'VISA', icono: 'credit_card', acepta_cuotas: true },
];

function renderWizard(props = {}) {
    return render(
        <AuthContext.Provider value={{ user: { id: 'u1' } }}>
            <div id="modal-root" />
            <GrupoGastoWizard
                isOpen={true}
                onClose={vi.fn()}
                grupoId={1}
                onGastoGuardado={vi.fn()}
                {...props}
            />
        </AuthContext.Provider>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    db.obtenerMiembrosDelGrupo.mockResolvedValue(MIEMBROS);
    db.getCategories.mockResolvedValue(CATEGORIAS);
    db.getPaymentMethods.mockResolvedValue(METODOS_PAGO);
    db.crearGastoGrupal.mockResolvedValue({ gasto: { id: 1 }, participantes: [] });
    db.crearGastoGrupalEnCuotas.mockResolvedValue({ gasto: { id: 1 }, gastos: [], participantes: [] });
});

describe('GrupoGastoWizard — paso 1 (monto/descripción)', () => {
    it('muestra paso 1 de 5 al abrir', async () => {
        renderWizard();
        await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
        expect(screen.getByLabelText(/Monto/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Descripción/i)).toBeInTheDocument();
    });

    it('bloquea avanzar si el monto es cero', async () => {
        renderWizard();
        await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        expect(await screen.findByText(/El monto debe ser mayor a cero/i)).toBeInTheDocument();
        expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
    });

    it('bloquea avanzar si la descripción está vacía', async () => {
        renderWizard();
        await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        expect(await screen.findByText(/La descripción es obligatoria/i)).toBeInTheDocument();
    });

    it('avanza a paso 2 con monto y descripción válidos', async () => {
        renderWizard();
        await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        fireEvent.change(screen.getByLabelText(/Descripción/i), { target: { value: 'Cena' } });
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument());
        expect(await screen.findByText('COMIDA')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla (el componente no existe)**

Run: `npm --prefix client run test -- GrupoGastoWizard`
Expected: FAIL — `Failed to resolve import "./GrupoGastoWizard"`

- [ ] **Step 3: Crear el esqueleto del wizard con pasos 1 y 2**

```jsx
import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import CurrencyInput from '../CurrencyInput';
import ChipSelector from '../ChipSelector';
import ResultModal from '../ResultModal';
import { useGrupoGastoForm, OPCIONES_CUOTAS } from '../../hooks/useGrupoGastoForm';
import * as db from '../../lib/db';

// Duración del bloqueo temporal de los botones Siguiente/Atrás al cambiar de paso,
// mismo criterio que GastoWizard.jsx — evita doble-click accidental durante la animación.
const DURACION_BLOQUEO_PASO_MS = 400;
const TOTAL_PASOS = 5;

/**
 * Wizard de alta de gasto grupal (modal de 5 pasos: monto/descripción → categoría/método/cuotas
 * → pagado por → participantes/nota → resumen). Reutiliza useGrupoGastoForm para estado,
 * validación y submit; el paso actual se maneja localmente, igual que GastoWizard.jsx.
 * Este componente es exclusivo de la CREACIÓN de gasto grupal — la edición sigue usando
 * GrupoGastoForm.jsx (formulario largo, sin wizard), sin cambios.
 *
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {string|number} grupoId
 * @param {(resultado: {tipo: string}) => void} [onGastoGuardado] - Callback tras cerrar el
 *   popup de resultado (éxito o error), para que el llamador recargue la lista de gastos.
 */
const GrupoGastoWizard = ({ isOpen, onClose, grupoId, onGastoGuardado }) => {
    const form = useGrupoGastoForm({ grupoId, modo: 'crear' });
    const {
        miembros, categorias, metodosPago, cargando, errorCarga,
        descripcion, setDescripcion,
        monto, setMonto,
        categoriaId, setCategoriaId,
        metodoPagoId, handleCambioMetodoPago,
        pagadoPor, setPagadoPor,
        participantes, setParticipantes,
        nota, setNota,
        esTarjeta,
        cuotas, setCuotas,
        primeraCuota, setPrimeraCuota,
        errorGuardado, fase, resultado, handleSubmit, volverAFormulario,
        divisionPreview, formatearMonto,
        user,
        erroresCampo, setErrorCampo,
        handleBlurDescripcion, handleBlurMonto, handleBlurPagadoPor, handleBlurPrimeraCuota,
    } = form;

    const [pasoGasto, setPasoGasto] = useState(1);
    const [botonesPasoBloqueados, setBotonesPasoBloqueados] = useState(false);

    // Al abrir el modal, siempre arranca en el paso 1 — evita reabrir en medio de un
    // wizard anterior si el usuario cerró sin terminar.
    useEffect(() => {
        if (isOpen) setPasoGasto(1);
    }, [isOpen]);

    useEffect(() => {
        setBotonesPasoBloqueados(true);
        const timer = setTimeout(() => setBotonesPasoBloqueados(false), DURACION_BLOQUEO_PASO_MS);
        return () => clearTimeout(timer);
    }, [pasoGasto]);

    const limpiarErrorCampo = (campo) => {
        if (erroresCampo[campo]) setErrorCampo(campo, null);
    };

    /** Valida los campos del paso actual antes de dejar avanzar. Devuelve el mensaje de error o null. */
    const validarPasoGasto = (paso) => {
        if (paso === 1) {
            if (!monto || Number(monto) <= 0) return 'El monto debe ser mayor a cero.';
            if (!descripcion.trim()) return 'La descripción es obligatoria.';
        }
        if (paso === 2) {
            if (!metodoPagoId) return 'Seleccioná un método de pago.';
            if (esTarjeta && !primeraCuota) return 'Indicá en qué mes vence la primera cuota.';
        }
        if (paso === 3) {
            if (!pagadoPor) return 'Seleccioná quién pagó.';
        }
        if (paso === 4) {
            if (participantes.length === 0) return 'Seleccioná al menos un participante.';
        }
        return null;
    };

    const [errorPaso, setErrorPaso] = useState(null);

    const handleSiguientePaso = () => {
        const error = validarPasoGasto(pasoGasto);
        if (error) {
            setErrorPaso(error);
            return;
        }
        setErrorPaso(null);
        setPasoGasto(prev => prev + 1);
    };

    const handleAtrasPaso = () => {
        setErrorPaso(null);
        setPasoGasto(prev => prev - 1);
    };

    const handleCerrarWizard = () => {
        onClose();
    };

    const handleSubmitWizard = (e) => {
        if (pasoGasto < TOTAL_PASOS) {
            e.preventDefault();
            handleSiguientePaso();
            return;
        }
        handleSubmit(e, {
            onSubmit: async () => {
                const params = {
                    grupoId: Number(grupoId),
                    descripcion,
                    monto,
                    pagadoPor,
                    fecha: form.fecha,
                    idCategoria: categoriaId ? Number(categoriaId) : undefined,
                    idMetodoPago: Number(metodoPagoId),
                    nota: nota || undefined,
                    participantesUserIds: participantes,
                };
                if (esTarjeta) {
                    await db.crearGastoGrupalEnCuotas({ ...params, cuotas, primeraCuota });
                } else {
                    await db.crearGastoGrupal(params);
                }
            },
            mensajeExito: '¡Gasto registrado!',
            mensajeErrorTitulo: 'No se pudo registrar el gasto',
        });
    };

    const handleContinuarResultado = () => {
        const fueExito = resultado?.tipo === 'success';
        onGastoGuardado?.({ tipo: resultado?.tipo });
        volverAFormulario();
        if (fueExito) {
            onClose();
        } else {
            // Si falló el guardado, el usuario vuelve a intentar desde el resumen
            // (paso 5), no desde cero — evita que tenga que recompletar todo el wizard.
            setPasoGasto(TOTAL_PASOS);
        }
    };

    if (cargando || errorCarga) {
        return (
            <Modal isOpen={isOpen} onClose={handleCerrarWizard} title="Nuevo gasto">
                {cargando && (
                    <div className="result-modal" role="status" aria-live="polite">
                        <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                            progress_activity
                        </span>
                        <h3 className="result-modal__titulo">Cargando datos del grupo...</h3>
                    </div>
                )}
                {errorCarga && (
                    <div className="form-error" role="alert">
                        <span className="material-symbols-outlined" aria-hidden="true">error_outline</span>
                        {errorCarga}
                    </div>
                )}
            </Modal>
        );
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={fase === 'form' ? handleCerrarWizard : undefined}
            title={fase === 'form' ? 'Nuevo gasto' : undefined}
            subtitle={fase === 'form' ? `Paso ${pasoGasto} de ${TOTAL_PASOS}` : undefined}
            footer={fase === 'form' ? (
                <div className="form-row">
                    {pasoGasto === 1 ? (
                        <button key="cancelar" type="button" onClick={handleCerrarWizard} className="btn btn-secondary" style={{ flex: 1 }}>
                            Cancelar
                        </button>
                    ) : (
                        <button key="atras" type="button" onClick={handleAtrasPaso} disabled={botonesPasoBloqueados} className="btn btn-secondary" style={{ flex: 1 }}>
                            Atrás
                        </button>
                    )}
                    {pasoGasto < TOTAL_PASOS ? (
                        <button key="siguiente" type="button" onClick={handleSiguientePaso} disabled={botonesPasoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                            Siguiente
                        </button>
                    ) : (
                        <button key="guardar" type="submit" form="form-gasto-grupal" disabled={botonesPasoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                            Guardar
                        </button>
                    )}
                </div>
            ) : undefined}
        >
            {fase === 'form' && (
                <form id="form-gasto-grupal" onSubmit={handleSubmitWizard} className="form-container">
                    {pasoGasto === 1 && (
                        <>
                        <div className="form-group">
                            <label className="form-label-box" htmlFor="grupo-gasto-monto">Monto</label>
                            <CurrencyInput
                                id="grupo-gasto-monto"
                                value={monto}
                                onChange={(val) => { setMonto(val); limpiarErrorCampo('monto'); }}
                                onBlur={handleBlurMonto}
                                ariaDescribedBy={erroresCampo.monto ? 'grupo-gasto-monto-error' : undefined}
                                className="input currency-input--grande"
                                autoFocus
                            />
                            {erroresCampo.monto && (
                                <p id="grupo-gasto-monto-error" className="edit-form-error" role="alert">{erroresCampo.monto}</p>
                            )}
                        </div>
                        <div className="form-group">
                            <label className="form-label-box" htmlFor="grupo-gasto-descripcion">Descripción</label>
                            <input
                                id="grupo-gasto-descripcion"
                                type="text"
                                value={descripcion}
                                onChange={(e) => { setDescripcion(e.target.value); limpiarErrorCampo('descripcion'); }}
                                onBlur={handleBlurDescripcion}
                                aria-describedby={erroresCampo.descripcion ? 'grupo-gasto-descripcion-error' : undefined}
                                maxLength={200}
                                className="input"
                            />
                            {erroresCampo.descripcion && (
                                <p id="grupo-gasto-descripcion-error" className="edit-form-error" role="alert">{erroresCampo.descripcion}</p>
                            )}
                        </div>
                        </>
                    )}
                    {pasoGasto === 2 && (
                        <>
                        <div className="form-group">
                            <label className="form-label-box" id="grupo-gasto-categoria-label">Categoría (opcional)</label>
                            <ChipSelector
                                labelId="grupo-gasto-categoria-label"
                                opciones={categorias}
                                valorSeleccionado={categoriaId ? Number(categoriaId) : null}
                                onChange={(id) => setCategoriaId(id)}
                                limiteVisible={6}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box" id="grupo-gasto-metodopago-label">Método de Pago</label>
                            <ChipSelector
                                labelId="grupo-gasto-metodopago-label"
                                opciones={metodosPago}
                                valorSeleccionado={metodoPagoId ? Number(metodoPagoId) : null}
                                onChange={(id) => handleCambioMetodoPago(id)}
                                limiteVisible={6}
                            />
                        </div>
                        {esTarjeta && (
                            <>
                            <div className="form-group">
                                <label className="form-label-box" htmlFor="grupo-gasto-cuotas">Cuotas</label>
                                <select
                                    id="grupo-gasto-cuotas"
                                    value={cuotas}
                                    onChange={(e) => setCuotas(parseInt(e.target.value))}
                                    className="form-select"
                                >
                                    {OPCIONES_CUOTAS.map(n => (
                                        <option key={n} value={n}>
                                            {n === 1 ? '1 cuota (pago único)' : `${n} cuotas`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label-box" htmlFor="grupo-gasto-primeracuota">Mes de la primera cuota <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input
                                    id="grupo-gasto-primeracuota"
                                    type="month"
                                    className="form-select"
                                    value={primeraCuota}
                                    onChange={(e) => { setPrimeraCuota(e.target.value); limpiarErrorCampo('primeraCuota'); }}
                                    onBlur={handleBlurPrimeraCuota}
                                    aria-describedby={erroresCampo.primeraCuota ? 'grupo-gasto-primeracuota-error' : undefined}
                                    required
                                />
                                {erroresCampo.primeraCuota && (
                                    <p id="grupo-gasto-primeracuota-error" className="edit-form-error" role="alert">{erroresCampo.primeraCuota}</p>
                                )}
                            </div>
                            </>
                        )}
                        </>
                    )}
                    {errorPaso && (
                        <p className="edit-form-error" role="alert">{errorPaso}</p>
                    )}
                    {errorGuardado && (
                        <p className="edit-form-error" role="alert">{errorGuardado}</p>
                    )}
                </form>
            )}
            {fase === 'guardando' && (
                <div className="result-modal" role="status" aria-live="polite">
                    <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                        progress_activity
                    </span>
                    <h3 className="result-modal__titulo">Guardando gasto...</h3>
                </div>
            )}
            {fase === 'resultado' && resultado && (
                <ResultModal
                    bare
                    isOpen={true}
                    onClose={handleContinuarResultado}
                    tipo={resultado.tipo}
                    titulo={resultado.titulo}
                    mensaje={resultado.mensaje}
                    textoBoton="Continuar"
                />
            )}
        </Modal>
    );
};

export default GrupoGastoWizard;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm --prefix client run test -- GrupoGastoWizard`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/grupos/GrupoGastoWizard.jsx client/src/components/grupos/GrupoGastoWizard.test.jsx
git commit -m "feat(grupos): agregar pasos 1-2 del wizard de gasto grupal"
```

---

### Task 2: Agregar paso 3 (pagado por) al wizard

**Files:**
- Modify: `client/src/components/grupos/GrupoGastoWizard.jsx`
- Test: `client/src/components/grupos/GrupoGastoWizard.test.jsx`

- [ ] **Step 1: Agregar test del paso 3**

Agregar al archivo de test, dentro de un nuevo `describe`:

```jsx
async function avanzarHastaPaso3() {
    await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/Descripción/i), { target: { value: 'Cena' } });
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument());
    fireEvent.click(await screen.findByText('EFECTIVO'));
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(screen.getByText('Paso 3 de 5')).toBeInTheDocument());
}

describe('GrupoGastoWizard — paso 3 (pagado por)', () => {
    it('muestra el select de pagado por con el usuario actual precargado', async () => {
        renderWizard();
        await avanzarHastaPaso3();
        expect(screen.getByLabelText(/Pagó/i)).toHaveValue('u1');
    });

    it('bloquea avanzar si no hay pagador seleccionado', async () => {
        renderWizard();
        await avanzarHastaPaso3();
        fireEvent.change(screen.getByLabelText(/Pagó/i), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        expect(await screen.findByText('Seleccioná quién pagó.')).toBeInTheDocument();
    });

    it('avanza a paso 4 con pagador seleccionado', async () => {
        renderWizard();
        await avanzarHastaPaso3();
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 4 de 5')).toBeInTheDocument());
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm --prefix client run test -- GrupoGastoWizard`
Expected: FAIL — paso 3 no existe todavía, `screen.getByText('Paso 3 de 5')` no encuentra nada.

- [ ] **Step 3: Agregar el bloque del paso 3 en `GrupoGastoWizard.jsx`**

Insertar después del bloque `{pasoGasto === 2 && ( ... )}` y antes de `{errorPaso && ...}`:

```jsx
                    {pasoGasto === 3 && (
                        <div className="form-group">
                            <label className="form-label-box" htmlFor="grupo-gasto-pagadopor">Pagó</label>
                            <select
                                id="grupo-gasto-pagadopor"
                                className="form-select"
                                value={pagadoPor}
                                onChange={(e) => { setPagadoPor(e.target.value); limpiarErrorCampo('pagadoPor'); }}
                                onBlur={handleBlurPagadoPor}
                                aria-describedby={erroresCampo.pagadoPor ? 'grupo-gasto-pagadopor-error' : undefined}
                            >
                                <option value="">Seleccioná quién pagó...</option>
                                {miembros.map((m) => (
                                    <option key={m.user_id} value={m.user_id}>
                                        {m.alias || m.nombre || 'Usuario sin nombre'}
                                        {m.user_id === user?.id ? ' (vos)' : ''}
                                    </option>
                                ))}
                            </select>
                            {erroresCampo.pagadoPor && (
                                <p id="grupo-gasto-pagadopor-error" className="edit-form-error" role="alert">{erroresCampo.pagadoPor}</p>
                            )}
                        </div>
                    )}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm --prefix client run test -- GrupoGastoWizard`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/grupos/GrupoGastoWizard.jsx client/src/components/grupos/GrupoGastoWizard.test.jsx
git commit -m "feat(grupos): agregar paso 3 (pagado por) del wizard de gasto grupal"
```

---

### Task 3: Agregar paso 4 (participantes + nota) al wizard

**Files:**
- Modify: `client/src/components/grupos/GrupoGastoWizard.jsx`
- Test: `client/src/components/grupos/GrupoGastoWizard.test.jsx`

- [ ] **Step 1: Agregar test del paso 4**

```jsx
async function avanzarHastaPaso4() {
    await avanzarHastaPaso3();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(screen.getByText('Paso 4 de 5')).toBeInTheDocument());
}

describe('GrupoGastoWizard — paso 4 (participantes/nota)', () => {
    it('muestra participantes con todos los activos preseleccionados', async () => {
        renderWizard();
        await avanzarHastaPaso4();
        expect(screen.getByText('Nico')).toBeInTheDocument();
        expect(screen.getByText('Ana')).toBeInTheDocument();
    });

    it('bloquea avanzar si no hay participantes seleccionados', async () => {
        renderWizard();
        await avanzarHastaPaso4();
        // Deselecciona ambos participantes (checkboxes de MiembrosSelector)
        fireEvent.click(screen.getAllByRole('checkbox')[0]);
        fireEvent.click(screen.getAllByRole('checkbox')[1]);
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        expect(await screen.findByText(/Seleccioná al menos un participante/i)).toBeInTheDocument();
    });

    it('avanza a paso 5 con participantes seleccionados', async () => {
        renderWizard();
        await avanzarHastaPaso4();
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument());
    });
});
```

Nota: `avanzarHastaPaso3` debe declararse una sola vez en el archivo (definida en Task 2); `avanzarHastaPaso4` se agrega en este mismo archivo, fuera de los `describe`, junto a la anterior.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm --prefix client run test -- GrupoGastoWizard`
Expected: FAIL — paso 4 no existe.

- [ ] **Step 3: Agregar el bloque del paso 4, importando `MiembrosSelector`**

Agregar el import al inicio del archivo:

```jsx
import MiembrosSelector from './MiembrosSelector';
```

Insertar después del bloque del paso 3:

```jsx
                    {pasoGasto === 4 && (
                        <>
                        <div className="form-group">
                            <label className="form-label-box" id="grupo-gasto-participantes-label">Participantes</label>
                            <MiembrosSelector
                                miembros={miembros}
                                seleccionados={participantes}
                                onChange={setParticipantes}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box" htmlFor="grupo-gasto-nota">Nota (opcional)</label>
                            <textarea
                                id="grupo-gasto-nota"
                                className="input"
                                placeholder="Detalles adicionales..."
                                value={nota}
                                onChange={(e) => setNota(e.target.value)}
                                rows={3}
                                maxLength={500}
                            />
                        </div>
                        </>
                    )}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm --prefix client run test -- GrupoGastoWizard`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/grupos/GrupoGastoWizard.jsx client/src/components/grupos/GrupoGastoWizard.test.jsx
git commit -m "feat(grupos): agregar paso 4 (participantes y nota) del wizard de gasto grupal"
```

---

### Task 4: Agregar paso 5 (resumen) y submit final

**Files:**
- Modify: `client/src/components/grupos/GrupoGastoWizard.jsx`
- Test: `client/src/components/grupos/GrupoGastoWizard.test.jsx`

- [ ] **Step 1: Agregar test del paso 5 y del submit completo**

```jsx
describe('GrupoGastoWizard — paso 5 (resumen) y guardado', () => {
    it('muestra el resumen con descripción, monto y preview de división', async () => {
        renderWizard();
        await avanzarHastaPaso4();
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument());
        expect(screen.getByText('Cena')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Guardar/i })).toBeInTheDocument();
    });

    it('guarda el gasto simple (sin cuotas) y muestra resultado exitoso', async () => {
        const onGastoGuardado = vi.fn();
        renderWizard({ onGastoGuardado });
        await avanzarHastaPaso4();
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));

        expect(await screen.findByText(/¡Gasto registrado!/i)).toBeInTheDocument();
        expect(db.crearGastoGrupal).toHaveBeenCalledWith(expect.objectContaining({
            grupoId: 1,
            descripcion: 'Cena',
            idMetodoPago: 10,
            participantesUserIds: ['u1', 'u2'],
        }));

        fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
        expect(onGastoGuardado).toHaveBeenCalledWith({ tipo: 'success' });
    });

    it('guarda un gasto en cuotas usando crearGastoGrupalEnCuotas', async () => {
        renderWizard();
        await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        fireEvent.change(screen.getByLabelText(/Descripción/i), { target: { value: 'Viaje' } });
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument());
        fireEvent.click(await screen.findByText('VISA'));
        fireEvent.change(await screen.findByLabelText(/primera cuota/i), { target: { value: '2026-09' } });
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 3 de 5')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 4 de 5')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));

        expect(await screen.findByText(/¡Gasto registrado!/i)).toBeInTheDocument();
        expect(db.crearGastoGrupalEnCuotas).toHaveBeenCalledWith(expect.objectContaining({
            idMetodoPago: 20,
            primeraCuota: '2026-09',
        }));
    });

    it('muestra resultado de error si falla el guardado y permite volver al formulario', async () => {
        db.crearGastoGrupal.mockRejectedValue(new Error('Error de red'));
        renderWizard();
        await avanzarHastaPaso4();
        fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 5 de 5')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));

        expect(await screen.findByText(/No se pudo registrar el gasto/i)).toBeInTheDocument();
        expect(screen.getByText('Error de red')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
        await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm --prefix client run test -- GrupoGastoWizard`
Expected: FAIL — paso 5 no existe, no hay botón "Guardar" visible en paso 4.

- [ ] **Step 3: Agregar el bloque del paso 5 (resumen)**

Insertar después del bloque del paso 4:

```jsx
                    {pasoGasto === 5 && (
                        <div className="grupo-gasto-nuevo__preview">
                            <p className="grupo-gasto-nuevo__preview-texto"><strong>{descripcion}</strong></p>
                            <p className="grupo-gasto-nuevo__preview-texto">{formatearMonto(Number(monto))}</p>
                            {categoriaId && (
                                <p className="grupo-gasto-nuevo__preview-nota">
                                    Categoría: {categorias.find(c => c.id === Number(categoriaId))?.nombre}
                                </p>
                            )}
                            <p className="grupo-gasto-nuevo__preview-nota">
                                Método de pago: {metodosPago.find(m => m.id === Number(metodoPagoId))?.nombre}
                                {esTarjeta ? ` — ${cuotas} cuota${cuotas !== 1 ? 's' : ''} desde ${primeraCuota}` : ''}
                            </p>
                            <p className="grupo-gasto-nuevo__preview-nota">
                                Pagó: {miembros.find(m => m.user_id === pagadoPor)?.alias || 'Sin definir'}
                            </p>
                            <p className="grupo-gasto-nuevo__preview-nota">
                                Participantes: {participantes.length}
                            </p>
                            {divisionPreview && (
                                divisionPreview.esTarjeta ? (
                                    <p className="grupo-gasto-nuevo__preview-texto">
                                        Cada uno paga: <strong>{formatearMonto(divisionPreview.montoPorPersona)}</strong> por mes durante <strong>{divisionPreview.cuotas} cuotas</strong>
                                    </p>
                                ) : (
                                    <p className="grupo-gasto-nuevo__preview-texto">
                                        Cada uno paga: <strong>{formatearMonto(divisionPreview.base)}</strong>
                                    </p>
                                )
                            )}
                        </div>
                    )}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm --prefix client run test -- GrupoGastoWizard`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/grupos/GrupoGastoWizard.jsx client/src/components/grupos/GrupoGastoWizard.test.jsx
git commit -m "feat(grupos): agregar paso 5 (resumen) y guardado del wizard de gasto grupal"
```

---

### Task 5: Enganchar el wizard en `GrupoDetalle.jsx` y eliminar la página vieja

**Files:**
- Modify: `client/src/pages/grupos/GrupoDetalle.jsx:1-20` (imports y estado), `:407-421` (botón)
- Modify: `client/src/App.jsx:13` (import lazy), `:91` (ruta)
- Delete: `client/src/pages/grupos/GrupoGastoNuevo.jsx`
- Delete: `client/src/pages/grupos/GrupoGastoNuevo.test.jsx`

- [ ] **Step 1: Agregar el import y el estado del wizard en `GrupoDetalle.jsx`**

En `client/src/pages/grupos/GrupoDetalle.jsx`, agregar el import junto a los demás componentes de grupos (después de la línea `import GrupoCuotasCard...`):

```jsx
import GrupoGastoWizard from '../../components/grupos/GrupoGastoWizard';
```

Agregar el estado del modal junto a los demás `useState` del componente (cerca de `cargandoGastos`):

```jsx
    const [wizardGastoAbierto, setWizardGastoAbierto] = useState(false);
```

- [ ] **Step 2: Reemplazar el botón "Cargar gasto" para abrir el modal en vez de navegar**

En `client/src/pages/grupos/GrupoDetalle.jsx:413-419`, reemplazar:

```jsx
                            <button
                                className="btn btn-primary"
                                onClick={() => navigate(`/grupos/${grupo.id}/gastos/nuevo`)}
                            >
                                <span className="material-symbols-outlined">add</span>
                                Cargar gasto
                            </button>
```

por:

```jsx
                            <button
                                className="btn btn-primary"
                                onClick={() => setWizardGastoAbierto(true)}
                            >
                                <span className="material-symbols-outlined">add</span>
                                Cargar gasto
                            </button>
```

- [ ] **Step 3: Renderizar el wizard, recargando gastos al guardar con éxito**

Agregar antes del cierre del componente (junto a los otros modales como `ConfirmModal`, después del bloque `{/* Modal de confirmación de eliminación de grupo */}`):

```jsx
            {/* Wizard de carga de gasto grupal */}
            <GrupoGastoWizard
                isOpen={wizardGastoAbierto}
                onClose={() => setWizardGastoAbierto(false)}
                grupoId={grupo.id}
                onGastoGuardado={({ tipo }) => {
                    if (tipo === 'success') cargarGastos();
                }}
            />
```

- [ ] **Step 4: Eliminar la ruta y el import lazy de `GrupoGastoNuevo` en `App.jsx`**

En `client/src/App.jsx:13`, eliminar la línea:

```jsx
const GrupoGastoNuevo   = lazy(() => import('./pages/grupos/GrupoGastoNuevo'));
```

En `client/src/App.jsx:91`, eliminar la línea:

```jsx
                <Route path="grupos/:id/gastos/nuevo" element={<PageTransition><GrupoGastoNuevo /></PageTransition>} />
```

- [ ] **Step 5: Eliminar los archivos de la página vieja**

```bash
git rm client/src/pages/grupos/GrupoGastoNuevo.jsx client/src/pages/grupos/GrupoGastoNuevo.test.jsx
```

- [ ] **Step 6: Correr toda la suite de grupos y verificar que nada se rompió**

Run: `npm --prefix client run test -- grupos`
Expected: PASS — incluye `GrupoGastoWizard.test.jsx` (14 tests) y `GrupoGastoEditar.test.jsx` (4 tests, sin cambios, deben seguir pasando intactos).

- [ ] **Step 7: Lint y build**

Run: `npm --prefix client run lint && npm --prefix client run build`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/grupos/GrupoDetalle.jsx client/src/App.jsx
git commit -m "feat(grupos): reemplazar página de carga de gasto grupal por el wizard modal"
```

---

## Cómo probar manualmente

1. `npm run dev`
2. Entrar a un grupo existente → tab "Gastos" → botón "Cargar gasto".
3. Verificar que abre un modal (no navega de página) con "Paso 1 de 5".
4. Completar monto y descripción → Siguiente.
5. Elegir categoría (opcional) y método de pago sin cuotas → Siguiente. Repetir el flujo probando con un método que sí acepta cuotas, verificando que pide cuotas + mes de primera cuota.
6. Elegir "Pagó" → Siguiente.
7. Elegir participantes y opcionalmente una nota → Siguiente.
8. Verificar que el paso 5 muestra el resumen correcto y el preview de división igualitaria.
9. Guardar → verificar spinner, luego popup de éxito, y que el gasto aparece en la lista sin recargar la página manualmente.
10. Verificar que **editar** un gasto grupal existente (botón de edición en `GrupoGastoRow`) sigue abriendo la página larga de siempre, sin wizard, y que guarda cambios correctamente — no debe haber ninguna regresión ahí.

---

## Self-review

**Cobertura del spec:**
- 5 pasos definidos según el diseño aprobado — cubierto en Tasks 1-4.
- Fecha eliminada del wizard, usa `fechaHoyArgentina()` implícito del hook — cubierto (Contexto + Task 1, el wizard nunca renderiza el campo `fecha` ni llama `setFecha`).
- Descripción obligatoria (a diferencia del wizard personal) — cubierto, validado en paso 1.
- Reemplazo del punto de entrada en `GrupoDetalle.jsx` — cubierto en Task 5.
- Eliminación de `GrupoGastoNuevo.jsx` y su ruta — cubierto en Task 5.
- `GrupoGastoEditar.jsx` sin cambios — verificado explícitamente en Task 5 Step 6 (su test debe seguir pasando intacto).
- `GastoWizard.jsx` (personal) sin cambios — ningún task lo toca.

**Placeholders:** ninguno — todos los steps tienen código completo.

**Consistencia de tipos/nombres:** `onGastoGuardado` se llama con `{ tipo }` de forma consistente entre Task 4 (test) y Task 5 (integración en `GrupoDetalle`). `validarPasoGasto` y sus mensajes replican exactamente los strings de `validar()` en `useGrupoGastoForm.js`.
