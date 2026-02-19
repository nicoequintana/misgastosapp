import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import CurrencyInput from '../components/CurrencyInput';
import { formatCurrency } from '../utils/format';
import * as db from '../lib/db';

// ==================== ESTADO INICIAL ====================

/** Estado inicial vacío para el formulario de gastos */
const ESTADO_INICIAL_GASTO = {
    descripcion: '',
    monto: '',
    id_categoria: '',
    id_metodo_pago: '',
    es_fijo: false,
    fecha: new Date().toISOString().split('T')[0]
};

/** Estado inicial vacío para las estadísticas */
const ESTADO_INICIAL_STATS = {
    totalGastos: 0,
    gastosFijos: 0,
    gastosVariables: 0,
    saldoDisponible: 0,
    ingresoMensual: 0,
    gastos: []
};

// ==================== SUB-COMPONENTES ====================

/**
 * Tarjeta de resumen financiero.
 * Muestra un ícono, etiqueta y monto formateado.
 * 
 * @param {string} title - Título de la métrica
 * @param {number} amount - Monto a mostrar (puede ser negativo)
 * @param {string} icon - Nombre del ícono de Material Symbols
 * @param {string} color - Nombre de la variable de color CSS (ej: 'success')
 */
const TarjetaResumen = ({ title, amount, icon, color }) => (
    <GlassCard className="summary-card">
        <div className="summary-icon" style={{
            backgroundColor: `var(--${color}-light)`,
            color: `var(--${color})`
        }}>
            <span className="material-symbols-outlined">{icon}</span>
        </div>
        <p className="summary-label">{title}</p>
        <h3 className="summary-amount">
            ${formatCurrency(amount)}
        </h3>
    </GlassCard>
);

/**
 * Tabla de gastos de solo lectura para el Dashboard.
 * Muestra descripción, categoría y monto alineados correctamente.
 * Las acciones de edición/eliminación se hacen en la página Movimientos.
 * 
 * @param {string} title - Título de la tabla
 * @param {Array} expenses - Lista de gastos a mostrar
 */
const TablaGastos = ({ title, expenses }) => (
    <GlassCard className="expense-table-card">
        <div className="table-header-box">
            <h3 className="table-title">{title}</h3>
            <span className="category-tag counter">{expenses.length} registros</span>
        </div>
        <div className="table-responsive">
            <table className="expense-table">
                <thead>
                    <tr>
                        <th className="text-left">Descripción</th>
                        <th className="text-center">Categoría</th>
                        <th className="text-right">Monto</th>
                    </tr>
                </thead>
                <tbody>
                    {expenses.length > 0 ? (
                        expenses.map((gasto) => (
                            <tr key={gasto.id} className="expense-row">
                                <td className="cell-desc">
                                    <span style={{ fontWeight: 600 }}>{gasto.descripcion}</span>
                                </td>
                                <td className="text-center">
                                    <span className="category-tag" style={{
                                        color: 'var(--primary)',
                                        display: 'inline-block'
                                    }}>
                                        {gasto.categorias?.nombre || 'General'}
                                    </span>
                                </td>
                                <td className="cell-amount amount-expense text-right">
                                    <span className="responsive-amount">
                                        -${formatCurrency(gasto.monto)}
                                    </span>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="3" className="empty-state">
                                No hay datos registrados aún.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </GlassCard>
);

// ==================== COMPONENTE PRINCIPAL ====================

/**
 * Página principal del Dashboard.
 * 
 * Responsabilidades:
 * - Mostrar resumen financiero (ingresos, saldo, gastos fijos/variables)
 * - Permitir registrar nuevos gastos
 * - Permitir actualizar el ingreso mensual
 * - Mostrar tablas de gastos recientes y fijos (solo lectura)
 * - Eliminar todos los gastos variables (acción de reseteo)
 */
const Dashboard = () => {
    const [stats, setStats] = useState(ESTADO_INICIAL_STATS);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState(null);

    // Control de los modales de la UI
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

    // Datos de los combos dinámicos (categorías y métodos de pago)
    const [categories, setCategories] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    // Estado del formulario de nuevo gasto
    const [expenseForm, setExpenseForm] = useState(ESTADO_INICIAL_GASTO);

    // Estado del formulario de ingreso mensual
    const [incomeAmount, setIncomeAmount] = useState('');

    // ==================== DATA FETCHING ====================

    /**
     * Obtiene las estadísticas y las carga en el estado.
     * Separado de fetchOpciones para poder llamarlos independientemente.
     */
    const fetchStats = useCallback(async () => {
        try {
            setCargando(true);
            setErrorCarga(null);
            const data = await db.getStats();
            setStats(data);
            // Sincronizar el input de ingreso con el valor actual en la DB
            setIncomeAmount(String(data.ingresoMensual));
        } catch (err) {
            console.error('❌ Error al obtener estadísticas:', err);
            setErrorCarga('No se pudieron cargar los datos. Intentá recargar la página.');
        } finally {
            setCargando(false);
        }
    }, []);

    /**
     * Obtiene las categorías y métodos de pago disponibles.
     * Se usa para poblar los selects del formulario de nuevos gastos.
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
        fetchStats();
        fetchOpciones();
    }, [fetchStats, fetchOpciones]);

    // Mejorar UX de teclado: permite confirmar acciones con Enter en botones
    useEffect(() => {
        const manejarTeclas = (e) => {
            if (e.key === 'Enter' && document.activeElement.tagName === 'BUTTON') {
                e.preventDefault();
                document.activeElement.click();
            }
        };
        document.addEventListener('keydown', manejarTeclas);
        return () => document.removeEventListener('keydown', manejarTeclas);
    }, []);

    // ==================== HANDLERS ====================

    /**
     * Guarda un nuevo gasto o actualiza uno existente.
     * Después de guardar, recarga las estadísticas y limpia el formulario.
     */
    const handleSubmitExpense = async (e) => {
        e.preventDefault();
        try {
            await db.createExpense(expenseForm);
            console.log('✅ Gasto creado correctamente');
            await fetchStats();
            setIsModalOpen(false);
            setExpenseForm(ESTADO_INICIAL_GASTO);
        } catch (err) {
            console.error('❌ Error al guardar gasto:', err);
            alert('Error al guardar el gasto. Por favor, intentá de nuevo.');
        }
    };

    /**
     * Actualiza el ingreso mensual del usuario en la base de datos.
     */
    const handleUpdateIncome = async (e) => {
        e.preventDefault();
        try {
            await db.updateIncome(parseFloat(incomeAmount) || 0);
            console.log('✅ Ingreso actualizado correctamente');
            await fetchStats();
            setIsIncomeModalOpen(false);
        } catch (err) {
            console.error('❌ Error al actualizar ingreso:', err);
            alert('Error al actualizar el ingreso. Por favor, intentá de nuevo.');
        }
    };

    /**
     * Elimina todos los gastos variables del mes.
     * Se usa al inicio de un nuevo período/ciclo.
     */
    const handleDeleteAllVariable = async () => {
        try {
            await db.deleteVariableExpenses();
            console.log('✅ Gastos variables eliminados correctamente');
            await fetchStats();
        } catch (err) {
            console.error('❌ Error al eliminar gastos variables:', err);
        } finally {
            setConfirmDeleteAll(false);
        }
    };

    /**
     * Valida si el usuario tiene datos maestros para crear un gasto.
     * Si faltan categorías o métodos, abre el modal de advertencia de configuración.
     */
    const handleAbrirNuevoGasto = () => {
        if (categories.length === 0 || paymentMethods.length === 0) {
            // Reusar el estado de confirmDeleteAll con una bandera especial para no duplicar modales
            setConfirmDeleteAll({ isConfigWarning: true });
        } else {
            setIsModalOpen(true);
        }
    };

    // Gastos separados por tipo para las tablas inferiores
    const gastosRecientes = stats.gastos.filter(g => !g.es_fijo).slice(0, 5);
    const gastosFijos = stats.gastos.filter(g => g.es_fijo);

    // ==================== RENDER ====================

    if (cargando) {
        return (
            <div className="dashboard-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: 'var(--text-secondary)' }}>Cargando datos...</p>
            </div>
        );
    }

    if (errorCarga) {
        return (
            <div className="dashboard-container">
                <div className="empty-state" style={{ color: 'var(--danger)', padding: '24px' }}>
                    {errorCarga}
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-container">

            {/* Encabezado con título y acciones principales */}
            <div className="dashboard-header">
                <div className="dashboard-title">
                    <h1>Dashboard</h1>
                    <p>Resumen general de tus finanzas personales</p>
                </div>
                <div className="dashboard-actions">
                    <button onClick={() => setIsIncomeModalOpen(true)} className="btn btn-secondary">
                        <span className="material-symbols-outlined">account_balance</span>
                        <span>Actualizar Ingreso</span>
                    </button>
                    <button onClick={handleAbrirNuevoGasto} className="btn btn-primary">
                        <span className="material-symbols-outlined">add</span>
                        <span>Nuevo Gasto</span>
                    </button>
                </div>
            </div>

            {/* Tarjetas de resumen financiero */}
            <div className="summary-grid">
                <TarjetaResumen title="Ingresos" amount={stats.ingresoMensual} icon="trending_up" color="success" />
                <TarjetaResumen title="Saldo Disponible" amount={stats.saldoDisponible} icon="account_balance_wallet" color="primary" />
                <TarjetaResumen title="Gastos Fijos" amount={stats.gastosFijos} icon="lock" color="warning" />
                <TarjetaResumen title="Gastos Variables" amount={stats.gastosVariables} icon="payments" color="danger" />
            </div>

            {/* Tablas de gastos (solo lectura) */}
            <div className="tables-grid">
                <div style={{ height: '100%' }}>
                    <TablaGastos title="Gastos Recientes" expenses={gastosRecientes} />
                </div>
                <div style={{ height: '100%' }}>
                    <TablaGastos title="Gastos Fijos" expenses={gastosFijos} />
                </div>
            </div>

            {/* Botón de acción peligrosa: eliminar todos los gastos variables */}
            <div className="dashboard-footer">
                <button onClick={() => setConfirmDeleteAll(true)} className="btn btn-danger-gradient">
                    <span className="material-symbols-outlined">delete_sweep</span>
                    <span>Eliminar gastos variables</span>
                </button>
            </div>

            {/* ========== MODALES ========== */}

            {/* Modal: Nuevo Gasto */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                <div className="modal-inner-header">
                    <h2 className="modal-title">Nuevo Gasto</h2>
                    <p className="modal-subtitle">Completá los detalles del movimiento</p>
                </div>
                <form onSubmit={handleSubmitExpense} className="form-container">
                    <div className="form-group">
                        <label className="form-label-box">Descripción</label>
                        <input
                            type="text"
                            value={expenseForm.descripcion}
                            onChange={(e) => setExpenseForm({ ...expenseForm, descripcion: e.target.value })}
                            required
                            className="input"
                            autoFocus
                        />
                    </div>
                    <div className="form-grid">
                        <div className="form-group">
                            <label className="form-label-box">Monto</label>
                            <CurrencyInput
                                value={expenseForm.monto}
                                onChange={(val) => setExpenseForm({ ...expenseForm, monto: val })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Fecha</label>
                            <input
                                type="date"
                                value={expenseForm.fecha}
                                onChange={(e) => setExpenseForm({ ...expenseForm, fecha: e.target.value })}
                                required
                                className="input"
                            />
                        </div>
                    </div>
                    <div className="form-grid">
                        <div className="form-group">
                            <label className="form-label-box">Categoría</label>
                            <select
                                value={expenseForm.id_categoria}
                                onChange={(e) => setExpenseForm({ ...expenseForm, id_categoria: e.target.value })}
                                required
                                className="form-select"
                            >
                                <option value="">Seleccionar...</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Método de Pago</label>
                            <select
                                value={expenseForm.id_metodo_pago}
                                onChange={(e) => setExpenseForm({ ...expenseForm, id_metodo_pago: e.target.value })}
                                required
                                className="form-select"
                            >
                                <option value="">Seleccionar...</option>
                                {paymentMethods.map(pm => (
                                    <option key={pm.id} value={pm.id}>{pm.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="form-checkbox-group">
                        <input
                            type="checkbox"
                            id="es_fijo"
                            checked={expenseForm.es_fijo}
                            onChange={(e) => setExpenseForm({ ...expenseForm, es_fijo: e.target.checked })}
                        />
                        <label htmlFor="es_fijo">Gasto Fijo</label>
                    </div>
                    <div className="form-row">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                            Guardar
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Modal: Actualizar Ingreso Mensual */}
            <Modal isOpen={isIncomeModalOpen} onClose={() => setIsIncomeModalOpen(false)}>
                <div className="modal-inner-header">
                    <h2 className="modal-title">Actualizar Ingreso Mensual</h2>
                    <p className="modal-subtitle">Establecé tu ingreso base para este mes</p>
                </div>
                <form onSubmit={handleUpdateIncome} className="form-container">
                    <div className="form-group">
                        <label className="form-label-box">Monto</label>
                        <CurrencyInput value={incomeAmount} onChange={setIncomeAmount} />
                    </div>
                    <div className="form-row">
                        <button type="button" onClick={() => setIsIncomeModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary pulse-animation" style={{ flex: 1 }}>
                            Actualizar
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Modal: Confirmar eliminación de gastos variables */}
            <ConfirmModal
                isOpen={!!(confirmDeleteAll && !confirmDeleteAll?.isConfigWarning)}
                onClose={() => setConfirmDeleteAll(false)}
                onConfirm={handleDeleteAllVariable}
                title="Eliminar Gastos Variables"
                message="¿Estás seguro de que deseas eliminar TODOS los gastos variables? Esta acción no se puede deshacer."
            />

            {/* Modal: Advertencia de configuración incompleta */}
            <Modal isOpen={!!confirmDeleteAll?.isConfigWarning} onClose={() => setConfirmDeleteAll(false)}>
                <div className="modal-inner-header">
                    <h2 className="modal-title" style={{ color: 'var(--warning)' }}>
                        ⚠️ Falta Configuración
                    </h2>
                    <p className="modal-subtitle">
                        No podés cargar gastos sin tener categorías ni métodos de pago.
                    </p>
                </div>
                <div className="modal-body-centered">
                    <p className="modal-message">
                        Para comenzar, necesitás agregar al menos una categoría y un método de pago.
                    </p>
                </div>
                <div className="modal-actions">
                    <button onClick={() => setConfirmDeleteAll(false)} className="btn btn-secondary">
                        Cancelar
                    </button>
                    <Link to="/configuracion" className="btn btn-primary">
                        Ir a Configuración
                    </Link>
                </div>
            </Modal>

        </div>
    );
};

export default Dashboard;
