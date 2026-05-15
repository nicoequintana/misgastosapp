import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CurrencyInput from '../../components/CurrencyInput';
import MiembrosSelector from '../../components/grupos/MiembrosSelector';
import { AuthContext } from '../../context/AuthContext';
import * as db from '../../lib/db';
import { fechaHoyArgentina } from '../../utils/format';
import { calcularDivisionIgualitaria } from '../../lib/cuotasHelper';

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
    const [cargandoMiembros, setCargandoMiembros] = useState(true);
    const [errorCarga, setErrorCarga] = useState(null);

    // Estado del formulario
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState(0);
    const [fecha, setFecha] = useState(() => fechaHoyArgentina());
    const [categoriaId, setCategoriaId] = useState('');
    const [pagadoPor, setPagadoPor] = useState('');
    const [participantes, setParticipantes] = useState([]);
    const [nota, setNota] = useState('');
    const [esTarjeta, setEsTarjeta] = useState(false);
    const [cuotas, setCuotas] = useState(1);

    // Estado de envío
    const [guardando, setGuardando] = useState(false);
    const [errorGuardado, setErrorGuardado] = useState(null);

    // Carga los miembros activos del grupo al montar
    const cargarMiembros = useCallback(async () => {
        if (!grupoId) return;
        try {
            setCargandoMiembros(true);
            setErrorCarga(null);
            const [datosMiembros, datosCategorias] = await Promise.all([
                db.obtenerMiembrosDelGrupo(grupoId),
                db.getCategories(),
            ]);

            const activos = (datosMiembros || []).filter((m) => m.estado === 'activo');
            setMiembros(activos);
            setCategorias((datosCategorias || []).filter((categoria) => !categoria.es_propia));
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

        try {
            setGuardando(true);
            const params = {
                grupoId: Number(grupoId),
                descripcion,
                monto,
                pagadoPor,
                fecha,
                idCategoria: categoriaId ? Number(categoriaId) : undefined,
                nota: nota || undefined,
                participantesUserIds: participantes,
            };

            if (esTarjeta) {
                await db.crearGastoGrupalEnCuotas({ ...params, cuotas });
            } else {
                await db.crearGastoGrupal(params);
            }
            // Navegar de vuelta al detalle del grupo, mostrando el tab de gastos
            navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } });
        } catch (err) {
            console.error('Error al guardar el gasto:', err);
            setErrorGuardado(err.message || 'No se pudo registrar el gasto. Intentá de nuevo.');
        } finally {
            setGuardando(false);
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

    return (
        <div className="grupos-page">
            {/* Encabezado */}
            <div className="grupos-page__header">
                <button
                    className="btn btn-ghost"
                    onClick={() => navigate(`/grupos/${grupoId}`)}
                    disabled={guardando}
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
                        disabled={guardando}
                        autoFocus
                    />
                </div>

                {/* Campo: Monto */}
                <div className="form-group">
                    <label className="form-label" htmlFor="monto">
                        Monto <span className="form-label__required">*</span>
                    </label>
                    <CurrencyInput
                        value={monto}
                        onChange={setMonto}
                        placeholder="0,00"
                        className="input"
                        required
                        disabled={guardando}
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
                        disabled={guardando}
                    />
                </div>

                {/* Campo: Categoría opcional */}
                <div className="form-group">
                    <label className="form-label" htmlFor="categoria">
                        Categoría <span className="form-label__opcional">(opcional)</span>
                    </label>
                    <select
                        id="categoria"
                        className="input"
                        value={categoriaId}
                        onChange={(e) => setCategoriaId(e.target.value)}
                        disabled={guardando}
                    >
                        <option value="">Sin categoría</option>
                        {categorias.length > 0 ? (
                            categorias.map((categoria) => (
                                <option key={categoria.id} value={categoria.id}>
                                    {categoria.nombre}
                                </option>
                            ))
                        ) : (
                            <option value="" disabled>
                                No hay categorías globales disponibles
                            </option>
                        )}
                    </select>
                </div>

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
                        disabled={guardando}
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

                {/* Toggle: Tarjeta de crédito */}
                <div className="form-checkbox-group">
                    <input
                        id="es-tarjeta"
                        type="checkbox"
                        className="form-checkbox"
                        checked={esTarjeta}
                        onChange={(e) => {
                            setEsTarjeta(e.target.checked);
                            if (!e.target.checked) setCuotas(1);
                        }}
                        disabled={guardando}
                    />
                    <label htmlFor="es-tarjeta" className="form-checkbox-label">
                        Pagado con tarjeta de crédito
                    </label>
                </div>

                {/* Selector de cuotas — solo si es tarjeta */}
                {esTarjeta && (
                    <div className="form-group">
                        <label className="form-label" htmlFor="cuotas">
                            Cuotas <span className="form-label__required">*</span>
                        </label>
                        <select
                            id="cuotas"
                            className="input"
                            value={cuotas}
                            onChange={(e) => setCuotas(parseInt(e.target.value))}
                            disabled={guardando}
                        >
                            <option value={1}>1 cuota (pago único)</option>
                            {Array.from({ length: 17 }, (_, i) => i + 2).map(n => (
                                <option key={n} value={n}>{n} cuotas</option>
                            ))}
                        </select>
                        <small className="form-hint">
                            La primera cuota vence el 1° del mes siguiente. Cada cuota se divide entre los participantes.
                        </small>
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
                        disabled={guardando}
                    />
                </div>

                {/* Acciones */}
                <div className="grupo-gasto-nuevo__actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(`/grupos/${grupoId}`)}
                        disabled={guardando}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={guardando || participantes.length === 0 || !monto || monto <= 0}
                    >
                        {guardando ? (
                            <>
                                <div className="loading-spinner loading-spinner--sm" />
                                Guardando...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">save</span>
                                Guardar gasto
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default GrupoGastoNuevo;
