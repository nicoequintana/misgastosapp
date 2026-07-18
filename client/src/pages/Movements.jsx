import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ChipSelector from '../components/ChipSelector';
import ResultModal from '../components/ResultModal';
import { formatCurrency, formatDate } from '../utils/format';
import CurrencyInput from '../components/CurrencyInput';
import GrupoFuturosCard from '../components/movements/GrupoFuturosCard';
import * as db from '../lib/db';
import { getGastosFuturos, getPrestamosGastosFuturos, deleteExpenseGroup, updateExpenseGroup } from '../lib/db';
import { useNotificaciones } from '../context/NotificacionesContext';

/**
 * Página de Movimientos.
 * Permite visualizar, filtrar, buscar, editar y eliminar todos los registros
 * de gastos (fijos y variables) almacenados en Supabase.
 */

const Movements = () => {
    const { agregarNotificacion } = useNotificaciones();
    const [movimientos, setMovimientos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState('Todas');

    const [gastoEditando, setGastoEditando] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [errorEdicion, setErrorEdicion] = useState('');

    const [gastoEliminando, setGastoEliminando] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [eliminando, setEliminando] = useState(false);

    // Popup de resultado inmediato tras editar/eliminar un gasto (éxito o error) — convive
    // con el historial persistente de NotificacionesContext, no lo reemplaza.
    const [resultadoGasto, setResultadoGasto] = useState(null);

    const [categories, setCategories] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    // Estado para movimientos futuros (cuotas de tarjeta de crédito)
    const [gastosFuturos, setGastosFuturos] = useState([]);
    const [cargandoFuturos, setCargandoFuturos] = useState(true);

    // Estado para movimientos futuros de préstamos
    const [prestamosFuturos, setPrestamosFuturos] = useState([]);
    const [cargandoPrestamosFuturos, setCargandoPrestamosFuturos] = useState(true);

    // Modales compartidos para editar/eliminar grupos (tarjeta y préstamos)
    const [grupoEditando, setGrupoEditando] = useState(null);
    const [isEditGrupoOpen, setIsEditGrupoOpen] = useState(false);
    const [guardandoGrupo, setGuardandoGrupo] = useState(false);
    const [errorGrupo, setErrorGrupo] = useState('');
    const [grupoEliminando, setGrupoEliminando] = useState(null);
    const [isDeleteGrupoOpen, setIsDeleteGrupoOpen] = useState(false);
    const [eliminandoGrupo, setEliminandoGrupo] = useState(false);

    /**
     * Obtiene todos los movimientos de gastos y actualiza el estado.
     */
    const fetchMovimientos = useCallback(async () => {
        try {
            setCargando(true);
            const data = await db.getExpenses();
            setMovimientos(data);
        } catch (err) {
            console.error('❌ Error al obtener los movimientos:', err);
        } finally {
            setCargando(false);
        }
    }, []);

    const fetchFuturos = useCallback(async () => {
        try {
            setCargandoFuturos(true);
            const data = await getGastosFuturos();
            setGastosFuturos(data);
        } catch (err) {
            console.error('❌ Error al obtener movimientos futuros:', err);
        } finally {
            setCargandoFuturos(false);
        }
    }, []);

    const fetchPrestamosFuturos = useCallback(async () => {
        try {
            setCargandoPrestamosFuturos(true);
            const data = await getPrestamosGastosFuturos();
            setPrestamosFuturos(data);
        } catch (err) {
            console.error('❌ Error al obtener préstamos futuros:', err);
        } finally {
            setCargandoPrestamosFuturos(false);
        }
    }, []);

    /**
     * Obtiene las categorías y métodos de pago para los selects del formulario.
     */
    const fetchOpciones = useCallback(async () => {
        try {
            const [cats, metodos] = await Promise.all([
                db.getCategories(),
                db.getPaymentMethods()
            ]);
            setCategories(cats);
            setPaymentMethods(metodos);
        } catch (err) {
            console.error('❌ Error al obtener opciones:', err);
        }
    }, []);

    useEffect(() => {
        fetchMovimientos();
        fetchOpciones();
        fetchFuturos();
        fetchPrestamosFuturos();
    }, [fetchMovimientos, fetchOpciones, fetchFuturos, fetchPrestamosFuturos]);

    // ── Handlers de movimientos futuros ──

    const handleEditarGrupo = (grupo) => {
        setErrorGrupo('');
        setGrupoEditando({
            id: grupo.id,
            descripcion: grupo.descripcionBase,
            idCategoria: grupo.idCategoria,
            // Fecha de la primera cuota futura como punto de partida
            fechaInicio: grupo.cuotasFuturas[0]?.fecha?.split('T')[0] || '',
            cuotasFuturas: grupo.cuotasFuturas,
        });
        setIsEditGrupoOpen(true);
    };

    const handleCerrarEditarGrupo = () => {
        if (guardandoGrupo) return;
        setIsEditGrupoOpen(false);
        setErrorGrupo('');
        setTimeout(() => setGrupoEditando(null), 300);
    };

    const handleGuardarGrupo = async (e) => {
        e.preventDefault();
        if (!grupoEditando || guardandoGrupo) return;
        setGuardandoGrupo(true);
        setErrorGrupo('');
        try {
            await updateExpenseGroup(grupoEditando.id, {
                descripcion: grupoEditando.descripcion,
                idCategoria: grupoEditando.idCategoria || null,
                fechaInicio: grupoEditando.fechaInicio,
            });
            setIsEditGrupoOpen(false);
            setTimeout(() => setGrupoEditando(null), 300);
            await Promise.all([fetchFuturos(), fetchPrestamosFuturos()]);
            agregarNotificacion({
                titulo: 'Compra actualizada',
                mensaje: `Se actualizaron las cuotas de "${grupoEditando.descripcion}".`,
                tipo: 'info',
                origen: 'manual',
            });
        } catch (err) {
            console.error('❌ Error al actualizar grupo:', err);
            setErrorGrupo('No se pudo actualizar. Intentá de nuevo.');
        } finally {
            setGuardandoGrupo(false);
        }
    };

    const handleEliminarGrupo = (grupo) => {
        setGrupoEliminando(grupo);
        setIsDeleteGrupoOpen(true);
    };

    const confirmarEliminarGrupo = async () => {
        if (!grupoEliminando || eliminandoGrupo) return;
        setEliminandoGrupo(true);
        const desc = grupoEliminando.descripcionBase;
        try {
            await deleteExpenseGroup(grupoEliminando.id);
            setIsDeleteGrupoOpen(false);
            setTimeout(() => setGrupoEliminando(null), 300);
            await Promise.all([fetchFuturos(), fetchPrestamosFuturos()]);
            agregarNotificacion({
                titulo: 'Compra eliminada',
                mensaje: `Se eliminaron todas las cuotas de "${desc}".`,
                tipo: 'warning',
                origen: 'manual',
            });
        } catch (err) {
            console.error('❌ Error al eliminar grupo:', err);
            agregarNotificacion({
                titulo: 'Error al eliminar',
                mensaje: 'No se pudo eliminar la compra en cuotas. Intentá de nuevo.',
                tipo: 'error',
                origen: 'manual',
            });
        } finally {
            setEliminandoGrupo(false);
        }
    };

    const handleEliminarClick = (gasto) => {
        setGastoEliminando(gasto);
        setIsDeleteModalOpen(true);
    };

    const handleCerrarEliminar = () => {
        if (eliminando) return;
        setIsDeleteModalOpen(false);
        setTimeout(() => setGastoEliminando(null), 300);
    };

    /**
     * Confirma y ejecuta la eliminación de un gasto.
     * Cierra el modal primero para evitar congelamiento de la UI durante la recarga.
     */
    const confirmarEliminar = async () => {
        if (!gastoEliminando || eliminando) return;
        setEliminando(true);
        const idAEliminar = gastoEliminando.id;
        try {
            const descEliminado = gastoEliminando.descripcion;
            await db.deleteExpense(idAEliminar);
            // Cerramos el modal antes de recargar para que la animación de cierre no compita con el re-render
            setIsDeleteModalOpen(false);
            setTimeout(() => setGastoEliminando(null), 300);
            await fetchMovimientos();
            agregarNotificacion({
                titulo: 'Gasto eliminado',
                mensaje: `Se eliminó "${descEliminado}".`,
                tipo: 'warning',
                origen: 'manual',
            });
            setResultadoGasto({ tipo: 'success', titulo: '¡Gasto eliminado!' });
        } catch (err) {
            console.error('❌ Error al eliminar el gasto:', err);
            agregarNotificacion({
                titulo: 'Error al eliminar',
                mensaje: 'No se pudo eliminar el gasto. Intentá de nuevo.',
                tipo: 'error',
                origen: 'manual',
            });
            setResultadoGasto({ tipo: 'error', titulo: '¡Error al eliminar!' });
        } finally {
            setEliminando(false);
        }
    };

    const handleEditarClick = (gasto) => {
        setErrorEdicion('');
        setGastoEditando({ ...gasto });
        setIsEditModalOpen(true);
    };

    const handleCerrarEdicion = () => {
        if (guardando) return;
        setIsEditModalOpen(false);
        setErrorEdicion('');
        setTimeout(() => setGastoEditando(null), 300);
    };

    /**
     * Guarda los cambios de la edición de un gasto.
     * Cierra el modal antes de recargar la lista para evitar que el re-render congele la UI.
     */
    const handleGuardarEdicion = async (e) => {
        e.preventDefault();
        if (!gastoEditando || guardando) return;

        setGuardando(true);
        setErrorEdicion('');
        // Normalizamos la fecha a YYYY-MM-DD para que pase la validación de db.js.
        // gastoEditando.fecha puede llegar como "2025-05-09T03:00:00+00:00" desde Supabase.
        const fechaNormalizada = gastoEditando.fecha
            ? gastoEditando.fecha.split('T')[0]
            : null;
        const payload = {
            descripcion: gastoEditando.descripcion,
            monto: gastoEditando.monto,
            id_categoria: gastoEditando.id_categoria,
            id_metodo_pago: gastoEditando.id_metodo_pago,
            fecha: fechaNormalizada,
            es_fijo: gastoEditando.es_fijo
        };
        try {
            await db.updateExpense(gastoEditando.id, payload);
            // Cerramos el modal antes de recargar para que la animación de cierre no compita con el re-render
            setIsEditModalOpen(false);
            setTimeout(() => setGastoEditando(null), 300);
            await fetchMovimientos();
            agregarNotificacion({
                titulo: 'Gasto actualizado',
                mensaje: `Se actualizó "${payload.descripcion}".`,
                tipo: 'info',
                origen: 'manual',
            });
            setResultadoGasto({ tipo: 'success', titulo: '¡Gasto actualizado!' });
        } catch (err) {
            console.error('❌ Error al actualizar el gasto:', err);
            setErrorEdicion('No se pudo actualizar el gasto. Intentá de nuevo.');
            setResultadoGasto({ tipo: 'error', titulo: '¡Error al actualizar!' });
        } finally {
            setGuardando(false);
        }
    };

    const movimientosFiltrados = useMemo(() =>
        movimientos.filter((mov) => {
            const coincideBusqueda = (mov.descripcion || '').toLowerCase().includes(busqueda.toLowerCase());
            const coincideCategoria = filtroCategoria === 'Todas' || mov.categorias?.nombre === filtroCategoria;
            return coincideBusqueda && coincideCategoria;
        }),
        [movimientos, busqueda, filtroCategoria]
    );

    const categoriasUnicas = useMemo(() =>
        ['Todas', ...new Set(movimientos.map(m => m.categorias?.nombre).filter(Boolean))],
        [movimientos]
    );

    return (
        <div className="movements-container">
            <div className="movements-header">
                <h1>Movimientos</h1>
                <p>Historial completo de tus gastos</p>
            </div>

            {/* Barra de búsqueda y filtros */}
            <GlassCard className="mb-8">
                <div className="movements-filters">
                    <div className="search-group flex-1">
                        <span className="material-symbols-outlined search-icon-inner">search</span>
                        <input
                            type="text"
                            placeholder="Buscar por descripción..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="input search-with-icon"
                        />
                    </div>
                    <div className="filter-group-fixed">
                        <select
                            value={filtroCategoria}
                            onChange={(e) => setFiltroCategoria(e.target.value)}
                            className="form-select"
                        >
                            {categoriasUnicas.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </GlassCard>

            {/* Tabla de movimientos */}
            <GlassCard>
                {cargando ? (
                    <div className="empty-state">
                        <div className="loader mx-auto"></div>
                        <p className="mt-4">Cargando movimientos...</p>
                    </div>
                ) : movimientosFiltrados.length === 0 ? (
                    <div className="empty-state">
                        <span className="material-symbols-outlined fs-48 opacity-30">receipt_long</span>
                        <p className="mt-4">No se encontraron movimientos</p>
                    </div>
                ) : (
                    <>
                        {/* Vista tabla — desktop */}
                        <div className="table-responsive movements-table-desktop">
                            <table className="movements-table">
                                <thead>
                                    <tr>
                                        <th className="td-date">Fecha</th>
                                        <th className="td-desc">Descripción</th>
                                        <th>Categoría</th>
                                        <th>Método</th>
                                        <th className="td-amount">Monto</th>
                                        <th className="text-center">Tipo</th>
                                        <th className="td-actions">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movimientosFiltrados.map((mov) => (
                                        <tr key={mov.id}>
                                            <td className="td-date">{formatDate(mov.fecha)}</td>
                                            <td className="td-desc">{mov.descripcion}</td>
                                            <td>
                                                <span className="category-tag-small">
                                                    {mov.categorias?.nombre || 'Sin categoría'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="method-tag-small">
                                                    {mov.metodos_pago?.nombre || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="td-amount">-${formatCurrency(mov.monto)}</td>
                                            <td className="text-center">
                                                {mov.es_fijo ? (
                                                    <span className="type-tag-small type-tag-fijo">FIJO</span>
                                                ) : (
                                                    <span className="type-tag-small type-tag-variable">VARIABLE</span>
                                                )}
                                            </td>
                                            <td className="td-actions">
                                                <div className="action-buttons-group">
                                                    <button type="button" onClick={() => handleEditarClick(mov)} className="action-btn edit" title="Editar">
                                                        <span className="material-symbols-outlined">edit</span>
                                                    </button>
                                                    <button type="button" onClick={() => handleEliminarClick(mov)} className="action-btn delete" title="Eliminar">
                                                        <span className="material-symbols-outlined">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Vista cards — mobile */}
                        <div className="movements-cards-mobile">
                            {movimientosFiltrados.map((mov) => (
                                <div key={mov.id} className="mov-card">
                                    <div className="mov-card-row">
                                        <span className="mov-card-desc">{mov.descripcion}</span>
                                        <span className="mov-card-amount">-${formatCurrency(mov.monto)}</span>
                                    </div>
                                    <div className="mov-card-row mov-card-meta">
                                        <div className="mov-card-tags">
                                            <span className="category-tag-small">{mov.categorias?.nombre || 'Sin categoría'}</span>
                                            <span className="method-tag-small">{mov.metodos_pago?.nombre || 'N/A'}</span>
                                            {mov.es_fijo ? (
                                                <span className="type-tag-small type-tag-fijo">FIJO</span>
                                            ) : (
                                                <span className="type-tag-small type-tag-variable">VARIABLE</span>
                                            )}
                                        </div>
                                        <div className="mov-card-actions">
                                            <span className="mov-card-date">{formatDate(mov.fecha)}</span>
                                            <button type="button" onClick={() => handleEditarClick(mov)} className="action-btn edit" title="Editar">
                                                <span className="material-symbols-outlined">edit</span>
                                            </button>
                                            <button type="button" onClick={() => handleEliminarClick(mov)} className="action-btn delete" title="Eliminar">
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </GlassCard>

            {/* Card: Movimientos Futuros (cuotas de tarjeta de crédito) */}
            {(cargandoFuturos || gastosFuturos.length > 0) && (
                <GrupoFuturosCard
                    grupos={gastosFuturos}
                    cargando={cargandoFuturos}
                    icono="schedule"
                    titulo="Movimientos Futuros"
                    subtitulo="Cuotas de tarjeta de crédito pendientes de débito"
                    labelContador="compra"
                    thDescrip="Compra"
                    onEditar={handleEditarGrupo}
                    onEliminar={handleEliminarGrupo}
                />
            )}

            {/* Card: Préstamos Futuros */}
            {(cargandoPrestamosFuturos || prestamosFuturos.length > 0) && (
                <GrupoFuturosCard
                    grupos={prestamosFuturos}
                    cargando={cargandoPrestamosFuturos}
                    icono="handshake"
                    titulo="Préstamos Futuros"
                    subtitulo="Cuotas de préstamos pendientes de pago"
                    labelContador="préstamo"
                    thDescrip="Préstamo"
                    onEditar={handleEditarGrupo}
                    onEliminar={handleEliminarGrupo}
                />
            )}

            {/* Modal: Editar gasto */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={handleCerrarEdicion}
                title="Editar Gasto"
                subtitle="Modificá la información de tu movimiento"
            >
                {gastoEditando && (
                    <form onSubmit={handleGuardarEdicion} className="form-container">
                        <div className="form-group">
                            <label className="form-label-box">Descripción</label>
                            <input
                                type="text"
                                value={gastoEditando.descripcion}
                                onChange={(e) => setGastoEditando(prev => ({ ...prev, descripcion: e.target.value }))}
                                required
                                disabled={guardando}
                                className="input"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Monto</label>
                            <CurrencyInput
                                value={gastoEditando.monto}
                                onChange={(val) => setGastoEditando(prev => ({ ...prev, monto: val }))}
                                disabled={guardando}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Categoría</label>
                            <ChipSelector
                                opciones={categories}
                                valorSeleccionado={gastoEditando.id_categoria ? Number(gastoEditando.id_categoria) : null}
                                onChange={(id) => setGastoEditando(prev => ({ ...prev, id_categoria: id }))}
                                limiteVisible={6}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Método de Pago</label>
                            <ChipSelector
                                opciones={paymentMethods}
                                valorSeleccionado={gastoEditando.id_metodo_pago ? Number(gastoEditando.id_metodo_pago) : null}
                                onChange={(id) => setGastoEditando(prev => ({ ...prev, id_metodo_pago: id }))}
                                limiteVisible={6}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Fecha</label>
                            <input
                                type="date"
                                value={gastoEditando.fecha ? gastoEditando.fecha.split('T')[0] : ''}
                                onChange={(e) => setGastoEditando(prev => ({ ...prev, fecha: e.target.value }))}
                                required
                                disabled={guardando}
                                className="input"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Tipo de gasto</label>
                            <ChipSelector
                                opciones={[
                                    { id: 'variable', nombre: 'Variable', icono: 'trending_down' },
                                    { id: 'fijo', nombre: 'Fijo', icono: 'lock' },
                                ]}
                                valorSeleccionado={gastoEditando.es_fijo ? 'fijo' : 'variable'}
                                onChange={(id) => setGastoEditando(prev => ({ ...prev, es_fijo: id === 'fijo' }))}
                                limiteVisible={2}
                            />
                        </div>
                        {errorEdicion && (
                            <p className="edit-form-error">{errorEdicion}</p>
                        )}
                        <div className="form-row mt-4">
                            <button type="button" onClick={handleCerrarEdicion} disabled={guardando} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                            <button type="submit" disabled={guardando} className="btn btn-primary" style={{ flex: 1 }}>
                                {guardando ? 'Guardando...' : 'Actualizar'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Modal: Confirmar eliminación */}
            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={handleCerrarEliminar}
                onConfirm={confirmarEliminar}
                title="Eliminar Gasto"
                message={`¿Estás seguro de que deseas eliminar "${gastoEliminando?.descripcion || 'este movimiento'}"? Esta acción no se puede deshacer.`}
                loading={eliminando}
            />

            {/* Modal: Editar compra en cuotas */}
            <Modal
                isOpen={isEditGrupoOpen}
                onClose={handleCerrarEditarGrupo}
                title="Editar compra en cuotas"
                subtitle="Los cambios se aplican a todas las cuotas pendientes"
            >
                {grupoEditando && (
                    <form onSubmit={handleGuardarGrupo} className="form-container">
                        <div className="form-group">
                            <label className="form-label-box">Descripción</label>
                            <input
                                type="text"
                                value={grupoEditando.descripcion}
                                onChange={e => setGrupoEditando(prev => ({ ...prev, descripcion: e.target.value }))}
                                required
                                disabled={guardandoGrupo}
                                className="input"
                                autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Categoría</label>
                            <select
                                value={grupoEditando.idCategoria || ''}
                                onChange={e => setGrupoEditando(prev => ({ ...prev, idCategoria: e.target.value }))}
                                disabled={guardandoGrupo}
                                className="form-select"
                            >
                                <option value="">Sin categoría</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Fecha de la próxima cuota</label>
                            <input
                                type="date"
                                value={grupoEditando.fechaInicio}
                                onChange={e => setGrupoEditando(prev => ({ ...prev, fechaInicio: e.target.value }))}
                                required
                                disabled={guardandoGrupo}
                                className="input"
                            />
                            <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                                Las fechas de las {grupoEditando.cuotasFuturas.length} cuotas siguientes se recalculan automáticamente mes a mes.
                            </small>
                        </div>
                        {errorGrupo && <p className="edit-form-error">{errorGrupo}</p>}
                        <div className="form-row mt-4">
                            <button type="button" onClick={handleCerrarEditarGrupo} disabled={guardandoGrupo} className="btn btn-secondary" style={{ flex: 1 }}>
                                Cancelar
                            </button>
                            <button type="submit" disabled={guardandoGrupo} className="btn btn-primary" style={{ flex: 1 }}>
                                {guardandoGrupo ? 'Guardando...' : 'Actualizar'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Modal: Confirmar eliminación de grupo de cuotas */}
            <ConfirmModal
                isOpen={isDeleteGrupoOpen}
                onClose={() => { if (!eliminandoGrupo) { setIsDeleteGrupoOpen(false); setTimeout(() => setGrupoEliminando(null), 300); } }}
                onConfirm={confirmarEliminarGrupo}
                title="Eliminar compra en cuotas"
                message={`¿Confirmas eliminar todas las cuotas de "${grupoEliminando?.descripcionBase || 'esta compra'}"? Se borran los ${grupoEliminando?.cuotasFuturas?.length || ''} meses restantes.`}
                loading={eliminandoGrupo}
            />

            {/* Popup de resultado inmediato: éxito o error al editar/eliminar un gasto */}
            <ResultModal
                isOpen={!!resultadoGasto}
                onClose={() => setResultadoGasto(null)}
                tipo={resultadoGasto?.tipo}
                titulo={resultadoGasto?.titulo}
            />
        </div>
    );
};

export default Movements;
