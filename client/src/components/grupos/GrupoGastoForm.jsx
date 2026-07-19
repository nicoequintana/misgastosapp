import React from 'react';
import CurrencyInput from '../CurrencyInput';
import ChipSelector from '../ChipSelector';
import MiembrosSelector from '../grupos/MiembrosSelector';
import { OPCIONES_CUOTAS } from '../../hooks/useGrupoGastoForm';

/**
 * Formulario compartido para crear/editar un gasto grupal.
 * Recibe todo el estado y handlers desde useGrupoGastoForm; los textos que
 * cambian según el modo (título, mensajes, botón) llegan como props.
 */
const GrupoGastoForm = ({
    form,
    titulo,
    tituloGuardando,
    textoBotonSubmit,
    onSubmit,
    onCancelar,
    onContinuar,
}) => {
    const {
        miembros, categorias, metodosPago, cargando, errorCarga,
        descripcion, setDescripcion,
        monto, setMonto,
        fecha, setFecha,
        categoriaId, setCategoriaId,
        metodoPagoId, handleCambioMetodoPago,
        pagadoPor, setPagadoPor,
        participantes, setParticipantes,
        nota, setNota,
        esTarjeta,
        cuotas, setCuotas,
        primeraCuota, setPrimeraCuota,
        errorGuardado, fase, resultado,
        divisionPreview, formatearMonto,
        user,
    } = form;

    // ── Estado de carga ──
    if (cargando) {
        return (
            <div className="grupos-page">
                <div className="grupos-page__loading">
                    <div className="loading-spinner" />
                    <p>Cargando datos del grupo...</p>
                </div>
            </div>
        );
    }

    // ── Error al cargar ──
    if (errorCarga) {
        return (
            <div className="grupos-page">
                <div className="grupos-page__header">
                    <button className="btn btn-ghost" onClick={onCancelar}>
                        <span className="material-symbols-outlined">arrow_back</span>
                        Volver
                    </button>
                </div>
                <div className="grupos-page__error">
                    <span className="material-symbols-outlined">error_outline</span>
                    {errorCarga}
                </div>
            </div>
        );
    }

    // ── Fase guardando: spinner ──
    if (fase === 'guardando') {
        return (
            <div className="grupos-page">
                <div className="result-modal" role="status" aria-live="polite">
                    <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                        progress_activity
                    </span>
                    <h3 className="result-modal__titulo">{tituloGuardando}</h3>
                </div>
            </div>
        );
    }

    // ── Fase resultado: éxito o error ──
    if (fase === 'resultado' && resultado) {
        return (
            <div className="grupos-page">
                <div className="result-modal">
                    <span
                        className="material-symbols-outlined result-modal__icono"
                        style={{
                            color: resultado.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                            borderColor: resultado.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                        }}
                    >
                        {resultado.tipo === 'error' ? 'cancel' : 'check_circle'}
                    </span>
                    <h3 className="result-modal__titulo">{resultado.titulo}</h3>
                    {resultado.mensaje && (
                        <p className="result-modal__subtexto">{resultado.mensaje}</p>
                    )}
                    <button
                        type="button"
                        className={`btn result-modal__boton result-modal__boton--${resultado.tipo === 'error' ? 'error' : 'success'}`}
                        onClick={onContinuar}
                    >
                        Continuar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="grupos-page">
            {/* Encabezado */}
            <div className="grupos-page__header">
                <button className="btn btn-ghost" onClick={onCancelar}>
                    <span className="material-symbols-outlined">arrow_back</span>
                    Volver
                </button>
                <h1 className="grupos-page__titulo">{titulo}</h1>
            </div>

            {/* Banner de error al guardar */}
            {errorGuardado && (
                <div className="grupos-page__error-banner">
                    <span className="material-symbols-outlined">error_outline</span>
                    {errorGuardado}
                </div>
            )}

            <form onSubmit={onSubmit} className="glass-card grupo-gasto-nuevo__form">

                {/* Campo: Descripción */}
                <div className="form-group">
                    <label className="form-label" htmlFor="descripcion">
                        Descripción <span className="form-label__required">*</span>
                    </label>
                    <input
                        id="descripcion"
                        type="text"
                        className="input"
                        placeholder="Ej: Cena del viernes"
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        maxLength={200}
                        required
                        autoFocus
                    />
                </div>

                {/* Campo: Monto */}
                <div className="form-group">
                    <label className="form-label" htmlFor="monto">
                        Monto <span className="form-label__required">*</span>
                    </label>
                    <CurrencyInput
                        id="monto"
                        value={monto}
                        onChange={setMonto}
                        placeholder="0,00"
                        className="input"
                        required
                    />
                </div>

                {/* Campo: Fecha */}
                <div className="form-group">
                    <label className="form-label" htmlFor="fecha">
                        Fecha <span className="form-label__required">*</span>
                    </label>
                    <input
                        id="fecha"
                        type="date"
                        className="input"
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        required
                    />
                </div>

                {/* Campo: Categoría opcional */}
                <div className="form-group">
                    <label className="form-label">
                        Categoría <span className="form-label__opcional">(opcional)</span>
                    </label>
                    <ChipSelector
                        opciones={categorias}
                        valorSeleccionado={categoriaId ? Number(categoriaId) : null}
                        onChange={(id) => setCategoriaId(id)}
                        limiteVisible={6}
                    />
                </div>

                {/* Campo: Método de pago */}
                <div className="form-group">
                    <label className="form-label">
                        Método de Pago <span className="form-label__required">*</span>
                    </label>
                    <ChipSelector
                        opciones={metodosPago}
                        valorSeleccionado={metodoPagoId ? Number(metodoPagoId) : null}
                        onChange={(id) => handleCambioMetodoPago(id)}
                        limiteVisible={6}
                    />
                </div>

                {/* Selector de cuotas y mes primera cuota — solo si el método acepta cuotas */}
                {esTarjeta && (
                    <>
                    <div className="form-group">
                        <label className="form-label" htmlFor="cuotas">
                            Cuotas <span className="form-label__required">*</span>
                        </label>
                        <select
                            id="cuotas"
                            className="input"
                            value={cuotas}
                            onChange={(e) => setCuotas(parseInt(e.target.value))}
                        >
                            {OPCIONES_CUOTAS.map(n => (
                                <option key={n} value={n}>
                                    {n === 1 ? '1 cuota (pago único)' : `${n} cuotas`}
                                </option>
                            ))}
                        </select>
                        <small className="form-hint">
                            Cada cuota se divide igualitariamente entre los participantes.
                        </small>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="primera-cuota">
                            Mes de la primera cuota <span className="form-label__required">*</span>
                        </label>
                        <input
                            id="primera-cuota"
                            type="month"
                            className="input"
                            value={primeraCuota}
                            onChange={(e) => setPrimeraCuota(e.target.value)}
                            required
                        />
                        <small className="form-hint">
                            El 1° del mes elegido se usa como fecha de vencimiento de la primera cuota.
                        </small>
                    </div>
                    </>
                )}

                {/* Campo: Pagado por */}
                <div className="form-group">
                    <label className="form-label" htmlFor="pagado-por">
                        Pagó <span className="form-label__required">*</span>
                    </label>
                    <select
                        id="pagado-por"
                        className="input"
                        value={pagadoPor}
                        onChange={(e) => setPagadoPor(e.target.value)}
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
                </div>

                {/* Campo: Participantes */}
                <div className="form-group">
                    <label className="form-label">
                        Participantes <span className="form-label__required">*</span>
                    </label>
                    <MiembrosSelector
                        miembros={miembros}
                        seleccionados={participantes}
                        onChange={setParticipantes}
                    />
                    {participantes.length === 0 && (
                        <p className="form-hint form-hint--error">
                            Seleccioná al menos un participante.
                        </p>
                    )}
                </div>

                {/* Preview de división igualitaria */}
                {divisionPreview && (
                    <div className="grupo-gasto-nuevo__preview">
                        <span className="material-symbols-outlined grupo-gasto-nuevo__preview-icon">
                            calculate
                        </span>
                        <div>
                            {divisionPreview.esTarjeta ? (
                                <>
                                    <p className="grupo-gasto-nuevo__preview-texto">
                                        Cada uno paga:{' '}
                                        <strong>{formatearMonto(divisionPreview.montoPorPersona)}</strong>
                                        {' '}por mes durante{' '}
                                        <strong>{divisionPreview.cuotas} cuotas</strong>
                                        {' '}({divisionPreview.participantes} participante{divisionPreview.participantes !== 1 ? 's' : ''})
                                    </p>
                                    <p className="grupo-gasto-nuevo__preview-nota">
                                        Total a dividir por cuota: {formatearMonto(divisionPreview.montoCuota)}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="grupo-gasto-nuevo__preview-texto">
                                        Cada uno paga:{' '}
                                        <strong>{formatearMonto(divisionPreview.base)}</strong>
                                        {' '}({participantes.length} participante{participantes.length !== 1 ? 's' : ''})
                                    </p>
                                    {divisionPreview.tieneDiferencia && (
                                        <p className="grupo-gasto-nuevo__preview-nota">
                                            El pagador absorbe {formatearMonto(divisionPreview.diferencia)} de diferencia por redondeo.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Campo: Nota (opcional) */}
                <div className="form-group">
                    <label className="form-label" htmlFor="nota">
                        Nota <span className="form-label__opcional">(opcional)</span>
                    </label>
                    <textarea
                        id="nota"
                        className="input"
                        placeholder="Detalles adicionales..."
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        rows={3}
                        maxLength={500}
                    />
                </div>

                {/* Acciones */}
                <div className="grupo-gasto-nuevo__actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onCancelar}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={participantes.length === 0 || !monto || monto <= 0}
                    >
                        <span className="material-symbols-outlined">save</span>
                        {textoBotonSubmit}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default GrupoGastoForm;
