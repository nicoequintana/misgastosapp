import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import CurrencyInput from '../CurrencyInput';
import ChipSelector from '../ChipSelector';
import ResultModal from '../ResultModal';
import * as db from '../../lib/db';
import { fechaHoyArgentina } from '../../utils/format';

/** Estado inicial vacío para el formulario de gastos */
const ESTADO_INICIAL_GASTO = {
    descripcion: '',
    monto: '',
    id_categoria: '',
    id_metodo_pago: '',
    es_fijo: false,
    // true cuando el usuario ya eligió fijo/variable antes de abrir el wizard
    // (ej. clic en la fila "Gastos Fijos"/"Gastos Variables" del summary-panel):
    // salta el paso 3 en vez de pedirlo de nuevo.
    tipoPreseleccionado: false,
    fecha: fechaHoyArgentina(),
    cuotas: 1,
    esTarjetaCredito: false,
    esPrestamo: false,
    primeraCuota: '',
};

// Opciones estáticas de cuotas — se definen fuera del componente para evitar recrearlas en cada render
const OPCIONES_CUOTAS_TARJETA = Array.from({ length: 18 }, (_, i) => i + 1);
const OPCIONES_CUOTAS_PRESTAMO = Array.from({ length: 120 }, (_, i) => i + 1);

// Duración del bloqueo temporal de los botones "Siguiente/Atrás" del wizard al
// cambiar de paso, para evitar doble-click accidental durante la animación.
const DURACION_BLOQUEO_PASO_MS = 400;

/**
 * Wizard de alta de gasto (modal de 3 pasos: monto/descripción → categoría/método/cuotas →
 * fijo/variable). Mantiene su propio estado interno (form, paso, fase); el Dashboard solo
 * decide si está abierto, le pasa los catálogos ya cargados y reacciona al guardado exitoso.
 *
 * @param {boolean} isOpen
 * @param {() => void} onClose - Cierra el modal (ver comentario de fade-out más abajo).
 * @param {Array} categories
 * @param {Array} paymentMethods
 * @param {string|null} errorOpciones
 * @param {() => void} fetchOpciones - Reintento de carga de catálogos.
 * @param {boolean} tipoPreseleccionado - true si se abrió desde "Gastos Fijos/Variables".
 * @param {boolean} [esFijoPreseleccionado] - Valor de es_fijo cuando tipoPreseleccionado es true.
 * @param {(gasto: object) => void} onGastoGuardado - Callback tras guardar con éxito (recibe expenseForm).
 */
const GastoWizard = ({
    isOpen,
    onClose,
    categories,
    paymentMethods,
    errorOpciones,
    fetchOpciones,
    tipoPreseleccionado = false,
    esFijoPreseleccionado = false,
    onGastoGuardado,
}) => {
    // Estado del formulario de nuevo gasto
    const [expenseForm, setExpenseForm] = useState(ESTADO_INICIAL_GASTO);
    const [errorForm, setErrorForm] = useState(null);
    // Errores de validación por campo, mostrados al perder foco (on-blur). Complementa a
    // errorForm (que se muestra al intentar avanzar de paso o al fallar el guardado): este
    // es más granular y da feedback apenas el usuario sale del campo con un valor inválido.
    const [erroresCampoGasto, setErroresCampoGasto] = useState({});
    // Paso actual del wizard de carga (1: monto/descripción, 2: categoría/método/cuotas, 3: fijo/variable)
    const [pasoGasto, setPasoGasto] = useState(1);
    // Se activa brevemente al cambiar de paso, para deshabilitar los botones de navegación
    // del footer. Evita que un click sobre "Siguiente" recaiga por error sobre "Guardar"
    // cuando este último ocupa la misma posición del footer tras el cambio de paso.
    const [botonesPasoBloqueados, setBotonesPasoBloqueados] = useState(false);
    // Popup de resultado inmediato tras crear el gasto (éxito o error) — convive con
    // el historial persistente de NotificacionesContext, no lo reemplaza.
    const [resultadoGasto, setResultadoGasto] = useState(null);
    // Fase visual del modal de alta de gasto: 'form' (wizard), 'guardando' (spinner
    // mientras corre createExpense) o 'resultado' (popup de éxito/error). Todo dentro
    // del mismo modal para evitar el corte de cerrar+abrir dos modales distintos.
    const [faseGasto, setFaseGasto] = useState('form');

    // Al abrir el modal, resetea wizard/formulario/fase — evita mostrar el resultado de una
    // sesión anterior si el usuario cerró el modal desde el paso 'resultado'. También aplica
    // el tipo preseleccionado (ej. clic en la fila "Gastos Fijos"/"Gastos Variables").
    useEffect(() => {
        if (!isOpen) return;
        setExpenseForm(tipoPreseleccionado
            ? { ...ESTADO_INICIAL_GASTO, es_fijo: esFijoPreseleccionado, tipoPreseleccionado: true }
            : ESTADO_INICIAL_GASTO);
        setErrorForm(null);
        setErroresCampoGasto({});
        setPasoGasto(1);
        setFaseGasto('form');
        setResultadoGasto(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Bloquea brevemente los botones de navegación del wizard al cambiar de paso.
    // Evita que un click sobre "Siguiente" recaiga por error sobre "Guardar" cuando
    // este último ocupa la misma posición del footer tras avanzar al último paso.
    useEffect(() => {
        setBotonesPasoBloqueados(true);
        const timer = setTimeout(() => setBotonesPasoBloqueados(false), DURACION_BLOQUEO_PASO_MS);
        return () => clearTimeout(timer);
    }, [pasoGasto]);

    // El paso 3 (Fijo/Variable) no aplica si tarjeta/préstamo ya definieron es_fijo automáticamente,
    // ni si el usuario ya lo eligió antes de abrir el wizard (ver tipoPreseleccionado)
    const aplicaPasoFijoVariable = !expenseForm.esTarjetaCredito && !expenseForm.esPrestamo && !expenseForm.tipoPreseleccionado;
    const totalPasosGasto = aplicaPasoFijoVariable ? 3 : 2;

    /** Valida los campos del paso actual antes de dejar avanzar. Devuelve el mensaje de error o null. */
    const validarPasoGasto = (paso) => {
        if (paso === 1) {
            if (!expenseForm.monto || Number(expenseForm.monto) <= 0) {
                return 'El monto debe ser mayor a cero.';
            }
        }
        if (paso === 2) {
            if (!expenseForm.id_categoria) return 'Seleccioná una categoría.';
            if (!expenseForm.id_metodo_pago) return 'Seleccioná un método de pago.';
            if ((expenseForm.esTarjetaCredito || expenseForm.esPrestamo) && !expenseForm.primeraCuota) {
                return 'Indicá en qué mes vence la primera cuota.';
            }
        }
        return null;
    };

    const handleSiguientePaso = () => {
        const error = validarPasoGasto(pasoGasto);
        if (error) {
            setErrorForm(error);
            return;
        }
        setErrorForm(null);
        setPasoGasto(prev => prev + 1);
    };

    const handleAtrasPaso = () => {
        setErrorForm(null);
        setPasoGasto(prev => prev - 1);
    };

    /** Valida el campo monto al perder foco (on-blur). Mismo mensaje que validarPasoGasto. */
    const handleBlurMontoGasto = () => {
        if (!expenseForm.monto || Number(expenseForm.monto) <= 0) {
            setErroresCampoGasto(prev => ({ ...prev, monto: 'El monto debe ser mayor a cero.' }));
        }
    };

    /** Valida el campo primeraCuota al perder foco (on-blur). Mismo mensaje que validarPasoGasto. */
    const handleBlurPrimeraCuotaGasto = () => {
        if ((expenseForm.esTarjetaCredito || expenseForm.esPrestamo) && !expenseForm.primeraCuota) {
            setErroresCampoGasto(prev => ({ ...prev, primeraCuota: 'Indicá en qué mes vence la primera cuota.' }));
        }
    };

    // Detecta si el método de pago seleccionado acepta cuotas (flag explícito en metodos_pago.acepta_cuotas)
    const handleCambioMetodoPago = (id) => {
        const metodo = paymentMethods.find(pm => pm.id === Number(id) || pm.id === id);
        const esTarjeta = metodo?.acepta_cuotas === true;
        setExpenseForm(prev => ({
            ...prev,
            id_metodo_pago: id,
            esTarjetaCredito: esTarjeta,
            // Al cambiar el método, reseteamos cuotas, primeraCuota y desbloqueamos es_fijo
            cuotas: 1,
            primeraCuota: '',
            es_fijo: esTarjeta ? true : prev.es_fijo,
        }));
    };

    // Detecta si la categoría seleccionada es de tipo préstamo (flag explícito en categorias.es_prestamo)
    const handleCambioCategoria = (id) => {
        const cat = categories.find(c => c.id === Number(id) || c.id === id);
        const esPrestamo = cat?.es_prestamo === true;
        setExpenseForm(prev => ({
            ...prev,
            id_categoria: id,
            esPrestamo,
            // Al cambiar categoría, reseteamos cuotas y primeraCuota si ya no aplica
            cuotas: esPrestamo ? prev.cuotas : (prev.esPrestamo ? 1 : prev.cuotas),
            primeraCuota: esPrestamo ? prev.primeraCuota : (prev.esPrestamo ? '' : prev.primeraCuota),
            es_fijo: esPrestamo ? true : prev.es_fijo,
        }));
    };

    /**
     * Cierra el modal de alta de gasto. No resetea wizard/formulario/fase acá: el modal
     * tarda ~300ms en desvanecerse (ver Modal.jsx), y si reseteáramos faseGasto a 'form'
     * en este mismo click, se alcanzaría a ver el wizard vacío destellando durante ese
     * fade-out en vez de mantener el popup de resultado hasta que termine de cerrarse.
     * El reset real ocurre en el efecto de apertura (isOpen), la próxima vez que se abre el modal.
     */
    const handleCerrarModalGasto = () => {
        onClose();
    };

    /**
     * Guarda un nuevo gasto. Después de guardar, recarga las estadísticas y notifica al Dashboard.
     * Valida todos los campos requeridos antes de procesar.
     */
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
            setResultadoGasto({ tipo: 'success', titulo: '¡Gasto registrado!' });
            setFaseGasto('resultado');
            // Notificar al Dashboard: dispara notificación de alta, alerta de gasto alto, recarga
            // de cuotas/préstamos si corresponde y recarga de stats.
            await onGastoGuardado?.({ ...expenseForm, descripcionMostrada });
        } catch (err) {
            console.error('❌ Error al guardar gasto:', err);
            setResultadoGasto({ tipo: 'error', titulo: 'No se pudo guardar el gasto', mensaje: err.message });
            setFaseGasto('resultado');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
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
            {faseGasto === 'form' && (
                <form id="form-nuevo-gasto" onSubmit={handleSubmitExpense} className="form-container">
                    {pasoGasto === 1 && (
                        <>
                        <div className="form-group">
                            <label className="form-label-box" htmlFor="expense-monto">Monto</label>
                            <CurrencyInput
                                id="expense-monto"
                                value={expenseForm.monto}
                                onChange={(val) => {
                                    setExpenseForm(prev => ({ ...prev, monto: val }));
                                    if (erroresCampoGasto.monto) {
                                        setErroresCampoGasto(prev => ({ ...prev, monto: null }));
                                    }
                                }}
                                onBlur={handleBlurMontoGasto}
                                ariaDescribedBy={erroresCampoGasto.monto ? 'expense-monto-error' : undefined}
                                className="input currency-input--grande"
                                autoFocus
                            />
                            {erroresCampoGasto.monto && (
                                <p id="expense-monto-error" className="edit-form-error" role="alert">{erroresCampoGasto.monto}</p>
                            )}
                        </div>
                        <div className="form-group">
                            <label className="form-label-box" htmlFor="expense-descripcion">Descripción (opcional)</label>
                            <input
                                id="expense-descripcion"
                                type="text"
                                value={expenseForm.descripcion}
                                onChange={(e) => setExpenseForm(prev => ({ ...prev, descripcion: e.target.value }))}
                                className="input"
                            />
                        </div>
                        </>
                    )}
                    {pasoGasto === 2 && errorOpciones && (
                        <div className="form-error" role="alert">
                            <span className="material-symbols-outlined" aria-hidden="true">error_outline</span>
                            {errorOpciones}
                            <button type="button" className="btn btn-secondary" onClick={fetchOpciones}>
                                Reintentar
                            </button>
                        </div>
                    )}
                    {pasoGasto === 2 && !errorOpciones && (
                        <>
                        <div className="form-group">
                            <label className="form-label-box" id="expense-categoria-label">Categoría</label>
                            <ChipSelector
                                labelId="expense-categoria-label"
                                opciones={categories}
                                valorSeleccionado={expenseForm.id_categoria ? Number(expenseForm.id_categoria) : null}
                                onChange={(id) => handleCambioCategoria(id)}
                                limiteVisible={6}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box" id="expense-metodopago-label">Método de Pago</label>
                            <ChipSelector
                                labelId="expense-metodopago-label"
                                opciones={paymentMethods}
                                valorSeleccionado={expenseForm.id_metodo_pago ? Number(expenseForm.id_metodo_pago) : null}
                                onChange={(id) => handleCambioMetodoPago(id)}
                                limiteVisible={6}
                            />
                        </div>
                        {expenseForm.esTarjetaCredito && (
                            <>
                            <div className="form-group">
                                <label className="form-label-box" htmlFor="expense-cuotas-tarjeta">Cuotas</label>
                                <select
                                    id="expense-cuotas-tarjeta"
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
                                <label className="form-label-box" htmlFor="expense-primeracuota-tarjeta">Mes de la primera cuota <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input
                                    id="expense-primeracuota-tarjeta"
                                    type="month"
                                    className="form-select"
                                    value={expenseForm.primeraCuota}
                                    onChange={(e) => {
                                        setExpenseForm(prev => ({ ...prev, primeraCuota: e.target.value }));
                                        if (erroresCampoGasto.primeraCuota) {
                                            setErroresCampoGasto(prev => ({ ...prev, primeraCuota: null }));
                                        }
                                    }}
                                    onBlur={handleBlurPrimeraCuotaGasto}
                                    aria-describedby={erroresCampoGasto.primeraCuota ? 'expense-primeracuota-error' : undefined}
                                    required
                                />
                                <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                                    El 1° del mes elegido es la fecha de vencimiento de la primera cuota.
                                </small>
                                {erroresCampoGasto.primeraCuota && (
                                    <p id="expense-primeracuota-error" className="edit-form-error" role="alert">{erroresCampoGasto.primeraCuota}</p>
                                )}
                            </div>
                            </>
                        )}
                        {expenseForm.esPrestamo && (
                            <>
                            <div className="form-group">
                                <label className="form-label-box" htmlFor="expense-cuotas-prestamo">Cuotas</label>
                                <select
                                    id="expense-cuotas-prestamo"
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
                                <label className="form-label-box" htmlFor="expense-primeracuota-prestamo">Mes del primer pago <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input
                                    id="expense-primeracuota-prestamo"
                                    type="month"
                                    className="form-select"
                                    value={expenseForm.primeraCuota}
                                    onChange={(e) => {
                                        setExpenseForm(prev => ({ ...prev, primeraCuota: e.target.value }));
                                        if (erroresCampoGasto.primeraCuota) {
                                            setErroresCampoGasto(prev => ({ ...prev, primeraCuota: null }));
                                        }
                                    }}
                                    onBlur={handleBlurPrimeraCuotaGasto}
                                    aria-describedby={erroresCampoGasto.primeraCuota ? 'expense-primeracuota-error' : undefined}
                                    required
                                />
                                <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                                    El 1° del mes elegido es la fecha del primer pago del préstamo.
                                </small>
                                {erroresCampoGasto.primeraCuota && (
                                    <p id="expense-primeracuota-error" className="edit-form-error" role="alert">{erroresCampoGasto.primeraCuota}</p>
                                )}
                            </div>
                            </>
                        )}
                        </>
                    )}
                    {pasoGasto === 3 && aplicaPasoFijoVariable && (
                        <div className="form-group">
                            <label className="form-label-box" id="expense-tipogasto-label">Tipo de gasto</label>
                            <ChipSelector
                                labelId="expense-tipogasto-label"
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
                <div className="result-modal" role="status" aria-live="polite">
                    <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                        progress_activity
                    </span>
                    <h3 className="result-modal__titulo">Guardando gasto...</h3>
                </div>
            )}
            {faseGasto === 'resultado' && resultadoGasto && (
                <ResultModal
                    bare
                    isOpen={true}
                    onClose={handleCerrarModalGasto}
                    tipo={resultadoGasto.tipo}
                    titulo={resultadoGasto.titulo}
                    mensaje={resultadoGasto.mensaje}
                    // El texto original del botón era "Continuar" tanto en éxito como en error
                    // (a diferencia del default "Ok" de ResultModal para tipo error) — se preserva
                    // explícito para no cambiar el copy visible al unificar con UX-14.
                    textoBoton="Continuar"
                />
            )}
        </Modal>
    );
};

export default GastoWizard;
