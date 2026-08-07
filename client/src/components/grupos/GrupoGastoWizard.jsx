import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import CurrencyInput from '../CurrencyInput';
import ChipSelector from '../ChipSelector';
import MiembrosSelector from './MiembrosSelector';
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
        erroresCampo, setErrorCampo,
        handleBlurDescripcion, handleBlurMonto, handleBlurPrimeraCuota, handleBlurPagadoPor,
        divisionPreview, formatearMonto,
        user,
    } = form;

    const [pasoGasto, setPasoGasto] = useState(1);
    const [botonesPasoBloqueados, setBotonesPasoBloqueados] = useState(false);

    // Al abrir el modal, siempre arranca en el paso 1 — evita reabrir en medio de un
    // wizard anterior si el usuario cerró sin terminar.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mismo patrón que GastoWizard.jsx (reset de paso al abrir el modal)
        if (isOpen) setPasoGasto(1);
    }, [isOpen]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mismo patrón que GastoWizard.jsx (bloqueo temporal de botones al cambiar de paso)
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
                    {pasoGasto === 3 && (
                        <div className="form-group">
                            <label className="form-label-box" htmlFor="grupo-gasto-pagadopor">Pagó <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <select
                                id="grupo-gasto-pagadopor"
                                className="form-select"
                                value={pagadoPor}
                                onChange={(e) => { setPagadoPor(e.target.value); limpiarErrorCampo('pagadoPor'); }}
                                onBlur={handleBlurPagadoPor}
                                aria-describedby={erroresCampo.pagadoPor ? 'grupo-gasto-pagadopor-error' : undefined}
                                required
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
                    {pasoGasto === 5 && (
                        <div className="grupo-gasto-nuevo__preview">
                            <span className="material-symbols-outlined grupo-gasto-nuevo__preview-icon">
                                calculate
                            </span>
                            <div>
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
                                        <>
                                            <p className="grupo-gasto-nuevo__preview-texto">
                                                Cada uno paga: <strong>{formatearMonto(divisionPreview.base)}</strong>
                                            </p>
                                            {divisionPreview.tieneDiferencia && (
                                                <p className="grupo-gasto-nuevo__preview-nota">
                                                    El pagador absorbe {formatearMonto(divisionPreview.diferencia)} de diferencia por redondeo.
                                                </p>
                                            )}
                                        </>
                                    )
                                )}
                            </div>
                        </div>
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
