import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { formatCurrency } from '../utils/format';
import CurrencyInput from '../components/CurrencyInput';
import * as db from '../lib/db';

/**
 * Página de Movimientos.
 * Permite visualizar, filtrar, buscar, editar y eliminar todos los registros
 * de gastos (fijos y variables) almacenados en Supabase.
 */

const Movements = () => {
    const [movimientos, setMovimientos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState('Todas');

    const [gastoEditando, setGastoEditando] = useState(null);
    const [gastoEliminando, setGastoEliminando] = useState(null);

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
    };

    /**
     * Confirma y ejecuta la eliminación de un gasto.
     */
    const confirmarEliminar = async () => {
        if (!gastoEliminando) return;
        try {
            await db.deleteExpense(gastoEliminando.id);
            console.log('✅ Gasto eliminado correctamente');
            setGastoEliminando(null);
            fetchMovimientos();
        } catch (err) {
            console.error('❌ Error al eliminar el gasto:', err);
        }
    };

    /**
     * Guarda los cambios de la edición de un gasto.
     */
    const handleGuardarEdicion = async (e) => {
        e.preventDefault();
        if (!gastoEditando) return;

        try {
            await db.updateExpense(gastoEditando.id, {
                descripcion: gastoEditando.descripcion,
                monto: gastoEditando.monto,
                id_categoria: gastoEditando.id_categoria,
                id_metodo_pago: gastoEditando.id_metodo_pago,
                fecha: gastoEditando.fecha,
                es_fijo: gastoEditando.es_fijo
            });
            console.log('✅ Gasto actualizado correctamente');
            setGastoEditando(null);
            fetchMovimientos();
        } catch (err) {
            console.error('❌ Error al actualizar el gasto:', err);
            alert('Error al actualizar el gasto. Por favor, intentá de nuevo.');
        }
    };

    // Filtrado y búsqueda sobre los movimientos cargados
    const movimientosFiltrados = movimientos.filter((mov) => {
        const coincideBusqueda = mov.descripcion?.toLowerCase().includes(busqueda.toLowerCase());
        const coincideCategoria = filtroCategoria === 'Todas' || mov.categorias?.nombre === filtroCategoria;
        return coincideBusqueda && coincideCategoria;
    });

    const totalFiltrado = movimientosFiltrados.reduce((suma, mov) => suma + parseFloat(mov.monto || 0), 0);
    const categoriasUnicas = ['Todas', ...new Set(movimientos.map(m => m.categorias?.nombre).filter(Boolean))];

    return (
        <div className="movements-container">
            <div className="movements-header">
                <h1>Movimientos</h1>
                <p>Historial completo de tus gastos</p>
            </div>

            {/* Barra de búsqueda y filtros */}
            <GlassCard className="mb-8">
                <div className="movements-filters">
                    <div className="filter-group">
                        <input
                            type="text"
                            placeholder="Buscar por descripción..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="input"
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
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                    <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Fecha</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Descripción</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Categoría</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Método</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Monto</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Tipo</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {movimientosFiltrados.map((mov) => (
                                    <tr key={mov.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                        <td style={{ padding: '16px 8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {/* Agregar T00:00:00 para evitar el desfase de zona horaria */}
                                            {new Date(mov.fecha + 'T00:00:00').toLocaleDateString('es-AR')}
                                        </td>
                                        <td style={{ padding: '16px 8px', fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>
                                            {mov.descripcion}
                                        </td>
                                        <td style={{ padding: '16px 8px' }}>
                                            <span className="category-tag" style={{ fontSize: '10px', padding: '4px 8px', background: 'var(--primary-light)', color: 'var(--primary)' }}>
                                                {mov.categorias?.nombre || 'Sin categoría'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px 8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {mov.metodos_pago?.nombre || 'N/A'}
                                        </td>
                                        <td style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)', fontSize: '13px' }}>
                                            -${formatCurrency(mov.monto)}
                                        </td>
                                        <td style={{ padding: '16px 8px', textAlign: 'center' }}>
                                            {mov.es_fijo ? (
                                                <span style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', borderRadius: '6px', fontWeight: 'bold' }}>FIJO</span>
                                            ) : (
                                                <span style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(16,185,129,0.1)', color: '#10b981', borderRadius: '6px', fontWeight: 'bold' }}>VARIABLE</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px 8px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                <button onClick={() => setGastoEditando(mov)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: '4px' }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                                                </button>
                                                <button onClick={() => handleEliminarClick(mov)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </GlassCard>

            {/* Modal: Editar gasto */}
            <Modal isOpen={!!gastoEditando} onClose={() => setGastoEditando(null)}>
                <div className="modal-inner-header">
                    <h2 className="modal-title">Editar Gasto</h2>
                    <p className="modal-subtitle">Modificá los datos del registro</p>
                </div>
                {gastoEditando && (
                    <form onSubmit={handleGuardarEdicion} className="form-container">
                        <div className="form-group">
                            <label className="form-label-box">Descripción</label>
                            <input
                                type="text"
                                value={gastoEditando.descripcion}
                                onChange={(e) => setGastoEditando({ ...gastoEditando, descripcion: e.target.value })}
                                required
                                className="input"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Monto</label>
                            <CurrencyInput
                                value={gastoEditando.monto}
                                onChange={(val) => setGastoEditando({ ...gastoEditando, monto: val })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Categoría</label>
                            <select
                                value={gastoEditando.id_categoria}
                                onChange={(e) => setGastoEditando({ ...gastoEditando, id_categoria: e.target.value })}
                                required
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
                                onChange={(e) => setGastoEditando({ ...gastoEditando, id_metodo_pago: e.target.value })}
                                required
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
                                onChange={(e) => setGastoEditando({ ...gastoEditando, fecha: e.target.value })}
                                required
                                className="input"
                            />
                        </div>
                        <div className="form-checkbox-group">
                            <input
                                type="checkbox"
                                id="es_fijo_edit"
                                checked={gastoEditando.es_fijo}
                                onChange={(e) => setGastoEditando({ ...gastoEditando, es_fijo: e.target.checked })}
                            />
                            <label htmlFor="es_fijo_edit">Gasto Fijo</label>
                        </div>
                        <div className="form-row mt-4">
                            <button type="button" onClick={() => setGastoEditando(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Actualizar</button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Modal: Confirmar eliminación */}
            <ConfirmModal
                isOpen={!!gastoEliminando}
                onClose={() => setGastoEliminando(null)}
                onConfirm={confirmarEliminar}
                title="Eliminar Gasto"
                message={`¿Estás seguro de que deseas eliminar "${gastoEliminando?.descripcion}"? Esta acción no se puede deshacer.`}
            />
        </div>
    );
};

export default Movements;
