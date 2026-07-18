import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CurrencyInput from '../../components/CurrencyInput';
import ChipSelector from '../../components/ChipSelector';
import MiembrosSelector from '../../components/grupos/MiembrosSelector';
import { AuthContext } from '../../context/AuthContext';
import * as db from '../../lib/db';
import { fechaHoyArgentina } from '../../utils/format';
import { calcularDivisionIgualitaria } from '../../lib/cuotasHelper';

// Opciones estáticas de cuotas — igual límite que el módulo individual (Dashboard.jsx)
const OPCIONES_CUOTAS = Array.from({ length: 18 }, (_, i) => i + 1);

/**
 * Página para registrar un nuevo gasto dentro de un grupo de gastos compartidos.
 * Carga los miembros activos del grupo, muestra un formulario completo
 * y calcula en tiempo real cuánto le corresponde a cada participante.
 *
 * Ruta: /grupos/:id/gastos/nuevo
 */
const GrupoGastoNuevo = () => {
    const { id: grupoId } = useParams();
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);

    // Estado de datos del grupo
    const [miembros, setMiembros] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [metodosPago, setMetodosPago] = useState([]);
    const [cargandoMiembros, setCargandoMiembros] = useState(true);
    const [errorCarga, setErrorCarga] = useState(null);

    // Estado del formulario
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState(0);
    const [fecha, setFecha] = useState(() => fechaHoyArgentina());
    const [categoriaId, setCategoriaId] = useState('');
    const [metodoPagoId, setMetodoPagoId] = useState('');
    const [pagadoPor, setPagadoPor] = useState('');
    const [participantes, setParticipantes] = useState([]);
    const [nota, setNota] = useState('');
    const [esTarjeta, setEsTarjeta] = useState(false);
    const [cuotas, setCuotas] = useState(1);
    const [primeraCuota, setPrimeraCuota] = useState('');

    // Estado de envío
    const [errorGuardado, setErrorGuardado] = useState(null);
    // Fase visual del formulario: 'form' (edición), 'guardando' (spinner mientras
    // corre la llamada a db) o 'resultado' (popup de éxito/error). Mismo patrón que
    // el modal de gasto individual en Dashboard.jsx.
    const [fase, setFase] = useState('form');
    const [resultado, setResultado] = useState(null);

    // Carga los miembros activos del grupo, categorías y métodos de pago al montar
    const cargarMiembros = useCallback(async () => {
        if (!grupoId) return;
        try {
            setCargandoMiembros(true);
            setErrorCarga(null);
            const [datosMiembros, datosCategorias, datosMetodos] = await Promise.all([
                db.obtenerMiembrosDelGrupo(grupoId),
                db.getCategories(),
                db.getPaymentMethods(),
            ]);

            const activos = (datosMiembros || []).filter((m) => m.estado === 'activo');
            setMiembros(activos);
            setCategorias((datosCategorias || []).filter((categoria) => !categoria.es_propia));
            setMetodosPago(datosMetodos || []);
            // Por defecto, el pagador es el usuario actual
            if (user?.id) setPagadoPor(user.id);
            // Por defecto, todos los miembros activos son participantes
            setParticipantes(activos.map((m) => m.user_id));
        } catch (err) {
            console.error('Error al cargar miembros:', err);
            setErrorCarga('No se pudieron cargar los miembros del grupo.');
        } finally {
            setCargandoMiembros(false);
        }
    }, [grupoId, user?.id]);

    useEffect(() => {
        cargarMiembros();
    }, [cargarMiembros]);

    // Detecta si el método de pago seleccionado acepta cuotas (flag explícito en
    // metodos_pago.acepta_cuotas) — mismo criterio que handleCambioMetodoPago en Dashboard.jsx.
    const handleCambioMetodoPago = (id) => {
        const metodo = metodosPago.find(pm => pm.id === Number(id) || pm.id === id);
        const aceptaCuotas = metodo?.acepta_cuotas === true;
        setMetodoPagoId(id);
        setEsTarjeta(aceptaCuotas);
        if (!aceptaCuotas) { setCuotas(1); setPrimeraCuota(''); }
    };

    // Calcula el preview de división igualitaria.
    // Si es tarjeta, muestra el monto por cuota por participante.
    const calcularPreview = () => {
        const n = participantes.length;
        if (!n || !monto || monto <= 0) return null;

        if (esTarjeta) {
            // Monto de la primera cuota (puede absorber diferencia de redondeo)
            const montoPorCuota = Math.floor((monto / cuotas) * 100) / 100;
            const diferenciaCuota = Math.round((monto - montoPorCuota * cuotas) * 100) / 100;
            const montoPrimeraCuota = Math.round((montoPorCuota + diferenciaCuota) * 100) / 100;

            // División de la primera cuota entre participantes
            const divisionPrimera = calcularDivisionIgualitaria(montoPrimeraCuota, participantes, pagadoPor);
            const montoPorPersona = divisionPrimera.find(d => d.user_id !== pagadoPor)?.monto_asignado
                ?? divisionPrimera[0]?.monto_asignado
                ?? 0;

            return {
                esTarjeta:        true,
                cuotas,
                montoCuota:       montoPrimeraCuota,
                montoPorPersona,
                participantes:    n,
            };
        }

        const base = Math.floor((monto / n) * 100) / 100;
        const diferencia = Math.round((monto - base * n) * 100) / 100;
        return { esTarjeta: false, base, diferencia, tieneDiferencia: diferencia > 0 };
    };

    const divisionPreview = calcularPreview();

    // Formatea monto en estilo argentino
    const formatearMonto = (val) =>
        `$ ${Number(val).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;

    // Validación y envío del formulario
    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorGuardado(null);

        // Validaciones client-side
        if (!descripcion.trim()) {
            setErrorGuardado('La descripción es obligatoria.');
            return;
        }
        if (!monto || monto <= 0) {
            setErrorGuardado('El monto debe ser mayor a cero.');
            return;
        }
        if (participantes.length === 0) {
            setErrorGuardado('Seleccioná al menos un participante.');
            return;
        }
        if (!pagadoPor) {
            setErrorGuardado('Seleccioná quién pagó.');
            return;
        }
        if (!metodoPagoId) {
            setErrorGuardado('Seleccioná un método de pago.');
            return;
        }
        if (esTarjeta && !primeraCuota) {
            setErrorGuardado('Indicá en qué mes vence la primera cuota.');
            return;
        }

        setFase('guardando');

        try {
            const params = {
                grupoId: Number(grupoId),
                descripcion,
                monto,
                pagadoPor,
                fecha,
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
            setResultado({ tipo: 'success', titulo: '¡Gasto registrado!' });
            setFase('resultado');
        } catch (err) {
            console.error('Error al guardar el gasto:', err);
            setResultado({ tipo: 'error', titulo: 'No se pudo registrar el gasto', mensaje: err.message });
            setFase('resultado');
        }
    };

    /** Vuelve al detalle del grupo tras ver el resultado (éxito o error). */
    const handleContinuar = () => {
        if (resultado?.tipo === 'success') {
            navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } });
        } else {
            setFase('form');
            setResultado(null);
        }
    };

    // ── Estado de carga ──
    if (cargandoMiembros) {
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
                    <button className="btn btn-ghost" onClick={() => navigate(`/grupos/${grupoId}`)}>
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
                    <h3 className="result-modal__titulo">Guardando gasto...</h3>
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
                        onClick={handleContinuar}
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
                <button
                    className="btn btn-ghost"
                    onClick={() => navigate(`/grupos/${grupoId}`)}
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                    Volver
                </button>
                <h1 className="grupos-page__titulo">Cargar gasto</h1>
            </div>

            {/* Banner de error al guardar */}
            {errorGuardado && (
                <div className="grupos-page__error-banner">
                    <span className="material-symbols-outlined">error_outline</span>
                    {errorGuardado}
                </div>
            )}

            <form onSubmit={handleSubmit} className="glass-card grupo-gasto-nuevo__form">

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
                        onClick={() => navigate(`/grupos/${grupoId}`)}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={participantes.length === 0 || !monto || monto <= 0}
                    >
                        <span className="material-symbols-outlined">save</span>
                        Guardar gasto
                    </button>
                </div>
            </form>
        </div>
    );
};

export default GrupoGastoNuevo;
