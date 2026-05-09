import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CurrencyInput from '../../components/CurrencyInput';
import MiembrosSelector from '../../components/grupos/MiembrosSelector';
import { AuthContext } from '../../context/AuthContext';
import * as db from '../../lib/db';
import { fechaHoyArgentina } from '../../utils/format';

/**
 * Página para editar un gasto grupal existente.
 * Carga el gasto con sus participantes actuales y permite modificar todos los campos.
 *
 * Ruta: /grupos/:id/gastos/:gastoId/editar
 */
const GrupoGastoEditar = () => {
    const { id: grupoId, gastoId } = useParams();
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);

    // Estado de datos del grupo
    const [miembros, setMiembros] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState(null);

    // Estado del formulario
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState(0);
    const [fecha, setFecha] = useState('');
    const [categoriaId, setCategoriaId] = useState('');
    const [pagadoPor, setPagadoPor] = useState('');
    const [participantes, setParticipantes] = useState([]);
    const [nota, setNota] = useState('');

    // Estado de envío
    const [guardando, setGuardando] = useState(false);
    const [errorGuardado, setErrorGuardado] = useState(null);

    // Carga el gasto existente, miembros y categorías al montar
    const cargarDatos = useCallback(async () => {
        if (!grupoId || !gastoId) return;
        try {
            setCargando(true);
            setErrorCarga(null);

            const [datosMiembros, datosCategorias, gastoExistente] = await Promise.all([
                db.obtenerMiembrosDelGrupo(grupoId),
                db.getCategories(),
                db.obtenerGastoConParticipantes(gastoId),
            ]);

            const activos = (datosMiembros || []).filter((m) => m.estado === 'activo');
            setMiembros(activos);
            setCategorias((datosCategorias || []).filter((c) => !c.es_propia));

            // Poblar formulario con los datos del gasto
            setDescripcion(gastoExistente.descripcion || '');
            setMonto(Number(gastoExistente.monto) || 0);
            setFecha(gastoExistente.fecha ? gastoExistente.fecha.split('T')[0] : fechaHoyArgentina());
            setCategoriaId(gastoExistente.id_categoria ? String(gastoExistente.id_categoria) : '');
            setPagadoPor(gastoExistente.pagado_por || '');
            setNota(gastoExistente.nota || '');
            setParticipantes((gastoExistente.participantes || []).map((p) => p.user_id));
        } catch (err) {
            console.error('Error al cargar el gasto:', err);
            setErrorCarga('No se pudo cargar el gasto. Verificá que exista o que tengas permisos.');
        } finally {
            setCargando(false);
        }
    }, [grupoId, gastoId]);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    // Calcula cuánto le toca a cada participante
    const calcularPorParticipante = () => {
        const n = participantes.length;
        if (!n || !monto || monto <= 0) return null;
        const base = Math.floor((monto / n) * 100) / 100;
        const diferencia = Math.round((monto - base * n) * 100) / 100;
        return { base, diferencia, tieneDiferencia: diferencia > 0 };
    };

    const divisionPreview = calcularPorParticipante();

    const formatearMonto = (val) =>
        `$ ${Number(val).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorGuardado(null);

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
            await db.actualizarGastoGrupal(gastoId, {
                grupoId,
                descripcion,
                monto,
                pagadoPor,
                fecha,
                idCategoria: categoriaId ? Number(categoriaId) : undefined,
                nota: nota || undefined,
                participantesUserIds: participantes,
            });
            navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } });
        } catch (err) {
            console.error('Error al actualizar el gasto:', err);
            setErrorGuardado(err.message || 'No se pudo actualizar el gasto. Intentá de nuevo.');
        } finally {
            setGuardando(false);
        }
    };

    // ── Estado de carga ──
    if (cargando) {
        return (
            <div className="grupos-page">
                <div className="grupos-page__loading">
                    <div className="loading-spinner" />
                    <p>Cargando gasto...</p>
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
                    onClick={() => navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } })}
                    disabled={guardando}
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                    Volver
                </button>
                <h1 className="grupos-page__titulo">Editar gasto</h1>
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
                        {categorias.map((categoria) => (
                            <option key={categoria.id} value={categoria.id}>
                                {categoria.nombre}
                            </option>
                        ))}
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
                        disabled={guardando}
                    />
                </div>

                {/* Acciones */}
                <div className="grupo-gasto-nuevo__actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } })}
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
                                Guardar cambios
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default GrupoGastoEditar;
