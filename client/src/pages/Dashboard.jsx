import React, { useState, useEffect, useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import CurrencyInput from '../components/CurrencyInput';
import * as db from '../lib/db';
import SummaryCard from '../components/dashboard/SummaryCard';
import DashboardTable from '../components/dashboard/DashboardTable';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';
import { useNotificaciones } from '../context/NotificacionesContext';

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

    // Contexto del layout: permite que el FAB del bottom nav mobile abra el modal
    const { showNewExpense, setShowNewExpense } = useOutletContext?.() || {};

    const {
        agregarNotificacion,
        verificarAlertasFinancieras,
        verificarAlertaGastoAlto,
        verificarAlertasGastosFijos,
        verificarAlertaConcentracionCategoria,
        verificarProyecciones,
    } = useNotificaciones();

    // Gasto diario disponible calculado por verificarProyecciones
    const [gastoDiarioDisponible, setGastoDiarioDisponible] = useState(null);

    // Control de los modales de la UI
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

    // Datos de los combos dinámicos (categorías y métodos de pago)
    const [categories, setCategories] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    // Estado del formulario de nuevo gasto
    const [expenseForm, setExpenseForm] = useState(ESTADO_INICIAL_GASTO);

    // Monto del formulario de ingreso
    const [incomeAmount, setIncomeAmount] = useState('');

    // ==================== DATA FETCHING ====================

    /**
     * Obtiene las estadísticas y las carga en el estado.
     * Separado de fetchOpciones para poder llamarlos independientemente.
     */
    const fetchStats = useCallback(async ({ verificarAlertas = false } = {}) => {
        try {
            setCargando(true);
            setErrorCarga(null);
            const data = await db.getStats();
            setStats(data);
            if (verificarAlertas) {
                // Alertas de Fase 2: saldo, porcentaje de ingreso, ingreso no configurado
                verificarAlertasFinancieras(data);
                // Alertas de Fase 4: gastos fijos/variables (async, no bloqueante)
                verificarAlertasGastosFijos(data);
                verificarAlertaConcentracionCategoria(data);
                // Proyecciones de Fase 5: gasto diario disponible + alertas
                verificarProyecciones(data).then(proyeccion => {
                    if (proyeccion?.gastoDiarioDisponible !== undefined) {
                        setGastoDiarioDisponible(proyeccion.gastoDiarioDisponible);
                    }
                });
            }
        } catch (err) {
            console.error('❌ Error al obtener estadísticas:', err);
            setErrorCarga('No se pudieron cargar los datos. Intentá recargar la página.');
        } finally {
            setCargando(false);
        }
    }, [verificarAlertasFinancieras, verificarAlertasGastosFijos, verificarAlertaConcentracionCategoria, verificarProyecciones]);

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
        // Al montar verificamos alertas financieras (ej: ingreso no configurado, saldo bajo)
        fetchStats({ verificarAlertas: true });
        fetchOpciones();
    }, [fetchStats, fetchOpciones]);

    // Cuando el FAB del bottom nav mobile dispara onNewExpense, abrimos el modal
    useEffect(() => {
        if (showNewExpense) {
            setIsModalOpen(true);
            setShowNewExpense?.(false);
        }
    }, [showNewExpense, setShowNewExpense]);

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
     * Valida todos los campos requeridos antes de procesar.
     */
    const handleSubmitExpense = async (e) => {
        e.preventDefault();
        
        // Validar que todos los campos requeridos estén completos
        if (!expenseForm.descripcion || !expenseForm.descripcion.trim()) {
            alert('Por favor, ingresá una descripción para el gasto.');
            return;
        }

        if (!expenseForm.monto || Number(expenseForm.monto) <= 0) {
            alert('El monto debe ser mayor a cero.');
            return;
        }

        if (!expenseForm.id_categoria) {
            alert('Por favor, seleccioná una categoría.');
            return;
        }

        if (!expenseForm.id_metodo_pago) {
            alert('Por favor, seleccioná un método de pago.');
            return;
        }

        try {
            await db.createExpense(expenseForm);
            console.log('✅ Gasto creado correctamente');
            // Primero cerramos y notificamos, luego recargamos stats con verificación de alertas
            setIsModalOpen(false);
            agregarNotificacion({
                titulo:  'Gasto registrado',
                mensaje: `Se registró "${expenseForm.descripcion}" por $${Number(expenseForm.monto).toLocaleString('es-AR')}.`,
                tipo:    'success',
                origen:  'manual',
            });
            // Verificar si el gasto supera el umbral de gasto alto
            verificarAlertaGastoAlto({ descripcion: expenseForm.descripcion, monto: expenseForm.monto });
            setExpenseForm(ESTADO_INICIAL_GASTO);
            // Al recargar stats verificamos alertas de saldo y porcentaje
            await fetchStats({ verificarAlertas: true });
        } catch (err) {
            console.error('❌ Error al guardar gasto:', err);
            alert(`Error al guardar el gasto: ${err.message || 'Por favor, intentá de nuevo.'}`);
        }
    };

    /**
     * Guarda el ingreso activo. Crea o actualiza el registro único del usuario.
     */
    const handleSaveIncome = async (e) => {
        e.preventDefault();
        try {
            await db.saveIncome(incomeAmount);
            console.log('✅ Ingreso guardado correctamente');
            await fetchStats({ verificarAlertas: true });
            setIsIncomeModalOpen(false);
            setIncomeAmount('');
            agregarNotificacion({
                titulo: 'Ingreso actualizado',
                mensaje: `Tu ingreso mensual fue actualizado a $${incomeAmount}.`,
                tipo: 'info',
                origen: 'ingresos',
            });
        } catch (err) {
            console.error('❌ Error al guardar ingreso:', err);
            alert('Error al guardar el ingreso. Por favor, intentá de nuevo.');
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
            await fetchStats({ verificarAlertas: true });
            agregarNotificacion({
                titulo: 'Gastos variables eliminados',
                mensaje: 'Todos los gastos variables del período fueron eliminados.',
                tipo: 'warning',
                origen: 'manual',
            });
        } catch (err) {
            console.error('❌ Error al eliminar gastos variables:', err);
            alert('No se pudieron eliminar los gastos variables. Por favor, intentá de nuevo.');
        } finally {
            setConfirmDeleteAll(false);
        }
    };

    /**
     * Valida si el usuario tiene datos maestros para crear un gasto.
     * Si faltan categorías o métodos, abre el modal de advertencia de configuración.
     */
    const handleAbrirNuevoGasto = () => {
        setIsModalOpen(true);
    };

    // Gastos separados por tipo para las tablas inferiores
    const gastosRecientes = stats.gastos.filter(g => !g.es_fijo).slice(0, 5);
    const gastosFijos = stats.gastos.filter(g => g.es_fijo);

    // ==================== RENDER ====================

    if (cargando) return <DashboardSkeleton />;

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
                        <span>Ingresos</span>
                    </button>
                    <button onClick={handleAbrirNuevoGasto} className="btn btn-primary">
                        <span className="material-symbols-outlined">add</span>
                        <span>Nuevo Gasto</span>
                    </button>
                </div>
            </div>

            <div className="summary-grid">
                <SummaryCard
                    title="Ingresos"
                    amount={stats.ingresoMensual}
                    icon="trending_up"
                    color="success"
                    subtitle="Ingreso registrado"
                />
                <SummaryCard
                    title="Saldo Disponible"
                    amount={stats.saldoDisponible}
                    icon="account_balance_wallet"
                    color="primary"
                    dominant
                    subtitle={stats.saldoDisponible >= 0 ? 'Estás en positivo' : 'Superaste el ingreso'}
                />
                <SummaryCard
                    title="Gastos Fijos"
                    amount={stats.gastosFijos}
                    icon="lock"
                    color="warning"
                    subtitle="Compromisos del mes"
                />
                <SummaryCard
                    title="Gastos Variables"
                    amount={stats.gastosVariables}
                    icon="payments"
                    color="danger"
                    subtitle="Gastos discrecionales"
                />
                {gastoDiarioDisponible !== null && (
                    <SummaryCard
                        title="Disponible por día"
                        amount={gastoDiarioDisponible}
                        icon="calendar_today"
                        color={gastoDiarioDisponible > 0 ? 'primary' : 'danger'}
                        subtitle="Hasta fin de mes"
                    />
                )}
            </div>

            <div className="tables-grid">
                <div style={{ height: '100%' }}>
                    <DashboardTable title="Gastos Recientes" expenses={gastosRecientes} />
                </div>
                <div style={{ height: '100%' }}>
                    <DashboardTable title="Gastos Fijos" expenses={gastosFijos} />
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
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Nuevo Gasto"
                subtitle="Completá los detalles del movimiento"
            >
                <form onSubmit={handleSubmitExpense} className="form-container">
                    <div className="form-group">
                        <label className="form-label-box">Descripción</label>
                        <input
                            type="text"
                            value={expenseForm.descripcion}
                            onChange={(e) => setExpenseForm(prev => ({ ...prev, descripcion: e.target.value }))}
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
                                onChange={(val) => setExpenseForm(prev => ({ ...prev, monto: val }))}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Fecha</label>
                            <input
                                type="date"
                                value={expenseForm.fecha}
                                onChange={(e) => setExpenseForm(prev => ({ ...prev, fecha: e.target.value }))}
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
                                onChange={(e) => setExpenseForm(prev => ({ ...prev, id_categoria: e.target.value }))}
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
                                onChange={(e) => setExpenseForm(prev => ({ ...prev, id_metodo_pago: e.target.value }))}
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
                            onChange={(e) => setExpenseForm(prev => ({ ...prev, es_fijo: e.target.checked }))}
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

            {/* Modal: Ingreso */}
            <Modal
                isOpen={isIncomeModalOpen}
                onClose={() => setIsIncomeModalOpen(false)}
                title="Ingresos"
                subtitle="Ingresá el monto de tu ingreso mensual"
            >
                <form onSubmit={handleSaveIncome} className="form-container">
                    <div className="form-group">
                        <label className="form-label-box">Monto</label>
                        <CurrencyInput
                            key={String(isIncomeModalOpen)}
                            value={incomeAmount}
                            onChange={setIncomeAmount}
                            required
                        />
                    </div>
                    <div className="form-row">
                        <button type="button" onClick={() => setIsIncomeModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                            Guardar
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


        </div>
    );
};

export default Dashboard;
