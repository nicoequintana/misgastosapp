import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { formatCurrency } from '../utils/format';
import CurrencyInput from '../components/CurrencyInput';
import * as db from '../lib/db';
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

    const [categories, setCategories] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

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
    }, [fetchMovimientos, fetchOpciones]);

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
        } catch (err) {
            console.error('❌ Error al eliminar el gasto:', err);
            alert('No se pudo eliminar el gasto. Por favor, intentá de nuevo.');
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
        const payload = {
            descripcion: gastoEditando.descripcion,
            monto: gastoEditando.monto,
            id_categoria: gastoEditando.id_categoria,
            id_metodo_pago: gastoEditando.id_metodo_pago,
            fecha: gastoEditando.fecha,
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
        } catch (err) {
            console.error('❌ Error al actualizar el gasto:', err);
            setErrorEdicion('No se pudo actualizar el gasto. Intentá de nuevo.');
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

    /**
     * Formatea una fecha de manera robusta para evitar "Invalid Date".
     */
    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        try {
            // Si viene solo fecha (YYYY-MM-DD), forzamos mediodía para evitar desfases de zona horaria
            const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00');
            if (isNaN(date.getTime())) return 'Fecha inválida';
            return date.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch {
            return 'Error fecha';
        }
    };

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
                            <select
                                value={gastoEditando.id_categoria}
                                onChange={(e) => setGastoEditando(prev => ({ ...prev, id_categoria: e.target.value }))}
                                required
                                disabled={guardando}
                                className="form-select"
                            >
                                <option value="">Seleccionar...</option>
                                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Método de Pago</label>
                            <select
                                value={gastoEditando.id_metodo_pago}
                                onChange={(e) => setGastoEditando(prev => ({ ...prev, id_metodo_pago: e.target.value }))}
                                required
                                disabled={guardando}
                                className="form-select"
                            >
                                <option value="">Seleccionar...</option>
                                {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.nombre}</option>)}
                            </select>
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
                        <div className="form-checkbox-group">
                            <input
                                type="checkbox"
                                id="es_fijo_edit"
                                checked={gastoEditando.es_fijo}
                                onChange={(e) => setGastoEditando(prev => ({ ...prev, es_fijo: e.target.checked }))}
                                disabled={guardando}
                            />
                            <label htmlFor="es_fijo_edit">Gasto Fijo</label>
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
        </div>
    );
};

export default Movements;
