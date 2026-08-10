import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../Modal';
import ConfirmModal from '../ConfirmModal';
import CurrencyInput from '../CurrencyInput';
import ChipSelector from '../ChipSelector';
import ResultModal from '../ResultModal';
import * as db from '../../lib/db';
import { useNotificaciones } from '../../context/NotificacionesContext';

/** Estado inicial vacío para el formulario de ingresos */
const INCOME_FORM_INICIAL = { monto: '', descripcion: '', categoria_id: '', es_recurrente: false };

// Duración del bloqueo temporal de los botones "Siguiente/Atrás" del wizard al
// cambiar de paso, para evitar doble-click accidental durante la animación.
const DURACION_BLOQUEO_PASO_MS = 400;

/**
 * Modal de gestión de ingresos: vista 'lista' (ingresos del mes + recurrentes, con
 * editar/eliminar) y vista 'wizard' (alta/edición en 2 pasos: monto/descripción →
 * categoría/tipo). Incluye el ConfirmModal de eliminar ingreso/recurrente porque es
 * parte del mismo flujo de gestión (misma cohesión que el resto del modal).
 *
 * Mantiene su propio estado interno (listas, form, vista, paso, fase). El Dashboard
 * solo decide si está abierto, le pasa el catálogo de categorías de ingreso y reacciona
 * al guardado/eliminado exitoso para recargar sus estadísticas.
 *
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {Array} categoriaIngresos
 * @param {() => Promise<void>} onIngresoGuardado - Callback tras crear/editar/eliminar con éxito
 *   (recarga fetchStats en el Dashboard).
 */
const IngresoModal = ({ isOpen, onClose, categoriaIngresos, onIngresoGuardado }) => {
    const { agregarNotificacion } = useNotificaciones();

    // Estado del panel de ingresos
    const [ingresosMes, setIngresosMes]             = useState([]);
    const [recurrentes, setRecurrentes]             = useState([]);
    const [incomeForm, setIncomeForm]               = useState(INCOME_FORM_INICIAL);
    const [incomeEditando, setIncomeEditando]       = useState(null);
    const [incomeConfirmDelete, setIncomeConfirmDelete] = useState(null);
    // Fase visual del modal de Ingresos: 'form' (formulario+lista), 'guardando' (spinner
    // mientras corre la acción) o 'resultado' (popup de éxito/error). A diferencia del
    // modal de gastos, acá el modal NO se cierra al llegar a 'resultado' — es un panel
    // persistente pensado para cargar varios ingresos seguidos.
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
    const [errorIngresoForm, setErrorIngresoForm] = useState(null);
    // Errores de validación por campo, mostrados al perder foco (on-blur). Complementa a
    // errorIngresoForm (que se muestra al intentar avanzar de paso o al fallar el guardado):
    // este es más granular y da feedback apenas el usuario sale del campo con un valor inválido.
    const [erroresCampoIngreso, setErroresCampoIngreso] = useState({});

    // Recurrentes activos para el listado — informativo
    const recurrentesActivos = recurrentes.filter(r => r.activo);

    /** Carga los ingresos del mes actual para mostrar en el panel. */
    const fetchIngresosMes = useCallback(async () => {
        try {
            const hoy = new Date();
            const data = await db.getIncomesByMonth(hoy.getFullYear(), hoy.getMonth() + 1);
            setIngresosMes(data);
        } catch (err) {
            console.error('❌ Error al obtener ingresos del mes:', err);
        }
    }, []);

    /** Carga ingresos recurrentes del usuario. */
    const fetchRecurrentes = useCallback(async () => {
        try {
            const data = await db.getRecurringIncomes();
            setRecurrentes(data);
        } catch (err) {
            console.error('❌ Error al obtener recurrentes:', err);
        }
    }, []);

    /* eslint-disable react-hooks/set-state-in-effect */
    // Al abrir el modal, resetea el panel a la vista de lista y carga los registros del
    // mes y los recurrentes — mismo comportamiento que el handleAbrirIngresos original.
    useEffect(() => {
        if (!isOpen) return;
        setIncomeForm(INCOME_FORM_INICIAL);
        setIncomeEditando(null);
        setFaseIngreso('form');
        setResultadoIngreso(null);
        setVistaIngreso('lista');
        setPasoIngreso(1);
        setErrorIngresoForm(null);
        setErroresCampoIngreso({});
        fetchIngresosMes();
        fetchRecurrentes();
    }, [isOpen, fetchIngresosMes, fetchRecurrentes]);

    // Bloquea brevemente los botones de navegación del wizard al cambiar de paso.
    // Evita que un click sobre "Siguiente" recaiga por error sobre "Guardar" cuando
    // este último ocupa la misma posición del footer tras avanzar al último paso.
    useEffect(() => {
        setBotonesPasoIngresoBloqueados(true);
        const timer = setTimeout(() => setBotonesPasoIngresoBloqueados(false), DURACION_BLOQUEO_PASO_MS);
        return () => clearTimeout(timer);
    }, [pasoIngreso]);
    /* eslint-enable react-hooks/set-state-in-effect */

    /** Abre el wizard de alta de ingreso desde la vista de lista, con el formulario vacío. */
    const handleAbrirWizardIngreso = () => {
        setIncomeForm(INCOME_FORM_INICIAL);
        setIncomeEditando(null);
        setPasoIngreso(1);
        setErrorIngresoForm(null);
        setVistaIngreso('wizard');
    };

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

    /** Valida el campo monto al perder foco (on-blur). Mismo mensaje que validarPasoIngreso. */
    const handleBlurMontoIngreso = () => {
        if (!incomeForm.monto || Number(incomeForm.monto) <= 0) {
            setErroresCampoIngreso(prev => ({ ...prev, monto: 'El monto debe ser mayor a cero.' }));
        }
    };

    /** Vuelve a la vista de lista tras ver el resultado, sin cerrar el modal de Ingresos. */
    const handleVolverFormularioIngreso = () => {
        setFaseIngreso('form');
        setResultadoIngreso(null);
        setVistaIngreso('lista');
        setPasoIngreso(1);
    };

    /**
     * Guarda un ingreso. Si es_recurrente = true, crea/actualiza en ingresos_recurrentes
     * y también registra el movimiento real del mes. Si es_recurrente = false, solo registra
     * el movimiento puntual. La fecha siempre es hoy (transparente para el usuario).
     */
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
        try {
            const editandoRecurrente = typeof incomeEditando === 'string' && incomeEditando.startsWith('rec-');
            if (editandoRecurrente) {
                await db.updateRecurringIncome(Number(incomeEditando.replace('rec-', '')), {
                    monto:        incomeForm.monto,
                    descripcion:  incomeForm.descripcion,
                    categoria_id: incomeForm.categoria_id || null,
                });
                agregarNotificacion({ titulo: 'Recurrente actualizado', mensaje: `Ingreso recurrente de $${Number(incomeForm.monto).toLocaleString('es-AR')} modificado.`, tipo: 'info', origen: 'ingresos' });
                setResultadoIngreso({ tipo: 'success', titulo: 'Recurrente actualizado' });
            } else if (incomeEditando) {
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
            await Promise.all([fetchIngresosMes(), fetchRecurrentes(), onIngresoGuardado?.()]);
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

    /** Carga los datos del ingreso seleccionado en el formulario para editar. */
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

    /** Elimina un ingreso puntual tras confirmación. */
    const handleEliminarIngreso = async (id) => {
        setIncomeConfirmDelete(null);
        setFaseIngreso('guardando');
        try {
            await db.deleteIncome(id);
            agregarNotificacion({ titulo: 'Ingreso eliminado', mensaje: 'El ingreso fue eliminado del período.', tipo: 'warning', origen: 'ingresos' });
            setResultadoIngreso({ tipo: 'success', titulo: 'Ingreso eliminado' });
            setFaseIngreso('resultado');
            await Promise.all([fetchIngresosMes(), onIngresoGuardado?.()]);
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

    /** Carga los datos del recurrente seleccionado en el formulario para editar. */
    const handleEditarRecurrente = (rec) => {
        setIncomeEditando(`rec-${rec.id}`);
        setIncomeForm({
            monto:         String(rec.monto),
            descripcion:   rec.descripcion || '',
            categoria_id:  rec.categoria_id || '',
            es_recurrente: false,
        });
        setPasoIngreso(1);
        setErrorIngresoForm(null);
        setVistaIngreso('wizard');
    };

    /** Elimina o desactiva un recurrente tras confirmación. */
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

    /**
     * Cierra el modal de Ingresos. A propósito NO reseteamos vistaIngreso/pasoIngreso/
     * incomeEditando acá: Modal.jsx mantiene el contenido montado 300ms tras isOpen=false
     * (animación isClosing) y si reseteáramos en el mismo tick se vería el listado
     * ('lista') destellando encima del wizard que el usuario estaba usando durante ese
     * fade-out. El useEffect de reapertura (líneas ~91-103) ya deja todo limpio la
     * próxima vez que se abre — mismo patrón documentado en GastoWizard.jsx y
     * GrupoGastoWizard.jsx para este mismo problema.
     */
    const handleCerrarModal = () => {
        onClose();
    };

    return (
        <>
        <Modal
            isOpen={isOpen}
            onClose={faseIngreso === 'form' ? handleCerrarModal : undefined}
            title={faseIngreso === 'form' ? (vistaIngreso === 'wizard' ? (typeof incomeEditando === 'string' && incomeEditando.startsWith('rec-') ? 'Editar recurrente' : incomeEditando ? 'Editar ingreso' : 'Nuevo ingreso') : 'Ingresos') : undefined}
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
                                    <div key={ing.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--input-bg)', borderRadius: '10px', border: '1px solid var(--input-border)' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--success)' }}>
                                                ${Number(ing.monto).toLocaleString('es-AR')}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                {ing.descripcion || 'Sin descripción'}{ing.categorias_ingresos?.nombre ? ` · ${ing.categorias_ingresos.nombre}` : ''}
                                                {ing.recurrente_id && <span style={{ marginLeft: '6px', fontSize: '11px', background: 'var(--input-border)', padding: '1px 5px', borderRadius: '4px' }}>recurrente</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', marginLeft: '10px' }}>
                                            <button type="button" onClick={() => handleEditarIngreso(ing)} className="btn btn-secondary" style={{ width: 'auto', minWidth: '44px', minHeight: '44px', flexShrink: 0, padding: '4px 8px' }} title="Editar" aria-label="Editar ingreso">
                                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden="true">edit</span>
                                            </button>
                                            <button type="button" onClick={() => setIncomeConfirmDelete(ing.id)} className="btn btn-danger-gradient" style={{ width: 'auto', minWidth: '44px', minHeight: '44px', flexShrink: 0, padding: '4px 8px' }} title="Eliminar" aria-label="Eliminar ingreso">
                                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--separator-color)', display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
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
                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--separator-color)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Recurrentes configurados
                            </div>
                            {recurrentesActivos.map(rec => (
                                <div key={rec.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', color: 'var(--text-secondary)' }}>
                                    <span>{rec.descripcion}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: 'var(--success)' }}>${Number(rec.monto).toLocaleString('es-AR')}/mes</span>
                                        <button type="button" onClick={() => handleEditarRecurrente(rec)} className="btn btn-secondary" style={{ width: 'auto', minWidth: '44px', minHeight: '44px', flexShrink: 0, padding: '4px 8px' }} title="Editar recurrente" aria-label="Editar recurrente">
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden="true">edit</span>
                                        </button>
                                        <button type="button" onClick={() => setIncomeConfirmDelete(`rec-${rec.id}`)} className="btn btn-danger-gradient" style={{ width: 'auto', minWidth: '44px', minHeight: '44px', flexShrink: 0, padding: '4px 8px' }} title="Eliminar recurrente" aria-label="Eliminar recurrente">
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden="true">delete</span>
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
                            <label className="form-label-box" htmlFor="income-monto">Monto</label>
                            <CurrencyInput
                                id="income-monto"
                                key={`income-${incomeEditando ?? 'new'}`}
                                value={incomeForm.monto}
                                onChange={(val) => {
                                    setIncomeForm(prev => ({ ...prev, monto: val }));
                                    if (erroresCampoIngreso.monto) {
                                        setErroresCampoIngreso(prev => ({ ...prev, monto: null }));
                                    }
                                }}
                                onBlur={handleBlurMontoIngreso}
                                ariaDescribedBy={erroresCampoIngreso.monto ? 'income-monto-error' : undefined}
                                className="input currency-input--grande"
                                autoFocus
                                required
                            />
                            {erroresCampoIngreso.monto && (
                                <p id="income-monto-error" className="edit-form-error" role="alert">{erroresCampoIngreso.monto}</p>
                            )}
                        </div>
                        <div className="form-group">
                            <label className="form-label-box" htmlFor="income-descripcion">Descripción (opcional)</label>
                            <input
                                id="income-descripcion"
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
                            <label className="form-label-box" id="income-categoria-label">Categoría (opcional)</label>
                            <ChipSelector
                                labelId="income-categoria-label"
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
                                <label className="form-label-box" id="income-tiporecurrente-label">Tipo de ingreso</label>
                                <ChipSelector
                                    labelId="income-tiporecurrente-label"
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
            {faseIngreso === 'guardando' && (
                <div className="result-modal" role="status" aria-live="polite">
                    <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                        progress_activity
                    </span>
                    <h3 className="result-modal__titulo">Guardando...</h3>
                </div>
            )}
            {faseIngreso === 'resultado' && resultadoIngreso && (
                <ResultModal
                    bare
                    isOpen={true}
                    onClose={handleVolverFormularioIngreso}
                    tipo={resultadoIngreso.tipo}
                    titulo={resultadoIngreso.titulo}
                    mensaje={resultadoIngreso.mensaje}
                    // El texto original del botón era "Continuar" tanto en éxito como en error
                    // (a diferencia del default "Ok" de ResultModal para tipo error) — se preserva
                    // explícito para no cambiar el copy visible al unificar con UX-14.
                    textoBoton="Continuar"
                />
            )}
        </Modal>

        {/* Confirm: eliminar ingreso o recurrente */}
        {!!incomeConfirmDelete && (
            <ConfirmModal
                isOpen={true}
                onClose={() => setIncomeConfirmDelete(null)}
                onConfirm={() => {
                    const id = incomeConfirmDelete;
                    if (typeof id === 'string' && id.startsWith('rec-')) {
                        handleEliminarRecurrente(Number(id.replace('rec-', '')));
                    } else {
                        handleEliminarIngreso(id);
                    }
                }}
                title={typeof incomeConfirmDelete === 'string' && incomeConfirmDelete.startsWith('rec-') ? 'Eliminar recurrente' : 'Eliminar ingreso'}
                message={typeof incomeConfirmDelete === 'string' && incomeConfirmDelete.startsWith('rec-') ? 'Se eliminarán los próximos registros automáticos de este ingreso recurrente.' : '¿Querés eliminar este ingreso? El total del mes se recalculará.'}
            />
        )}
        </>
    );
};

export default IngresoModal;
