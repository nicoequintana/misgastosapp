import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import CurrencyInput from '../components/CurrencyInput';
import * as db from '../lib/db';
import { getTarjetasEnCuotas, getGastosFuturos, getPrestamosEnCuotas, getPrestamosGastosFuturos } from '../lib/db';
import SummaryCard from '../components/dashboard/SummaryCard';
import DashboardTable from '../components/dashboard/DashboardTable';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';
import TarjetasCuotasCard from '../components/dashboard/TarjetasCuotasCard';
import PrestamosCard from '../components/dashboard/PrestamosCard';
import { useNotificaciones } from '../context/NotificacionesContext';
import { useAppReady } from '../context/AppReadyContext';
import { fechaHoyArgentina } from '../utils/format';

// ==================== ESTADO INICIAL ====================

/** Estado inicial vacío para el formulario de gastos */
const ESTADO_INICIAL_GASTO = {
    descripcion: '',
    monto: '',
    id_categoria: '',
    id_metodo_pago: '',
    es_fijo: false,
    fecha: fechaHoyArgentina(),
    cuotas: 1,
    esTarjetaCredito: false,
    esPrestamo: false,
    primeraCuota: '',
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

    const { setAppReady } = useAppReady();
    // Solo notificamos appReady en el primer fetch para no re-triggerear el loader
    const primeraVez = useRef(true);

    // Contexto del layout: permite que el FAB del bottom nav mobile abra el modal
    const { showNewExpense, setShowNewExpense } = useOutletContext?.() || {};

    const {
        agregarNotificacion,
        config: configNotif,
        verificarAlertasFinancieras,
        verificarAlertaGastoAlto,
        verificarAlertasGastosFijos,
        verificarAlertaConcentracionCategoria,
        verificarProyecciones,
        generarResumenDiario,
        generarResumenSemanal,
        generarResumenMensual,
    } = useNotificaciones();

    // Refs estables para las funciones de verificación: fetchStats no se recrea
    // aunque el contexto de notificaciones se actualice entre renders.
    const verificarAlertasFinancierasRef       = useRef(verificarAlertasFinancieras);
    const verificarAlertasGastosFijosRef       = useRef(verificarAlertasGastosFijos);
    const verificarAlertaConcentracionRef      = useRef(verificarAlertaConcentracionCategoria);
    const verificarProyeccionesRef             = useRef(verificarProyecciones);
    const generarResumenDiarioRef              = useRef(generarResumenDiario);
    const generarResumenSemanalRef             = useRef(generarResumenSemanal);
    const generarResumenMensualRef             = useRef(generarResumenMensual);
    const configNotifRef                       = useRef(configNotif);
    const dispararResumenesRef                 = useRef(null);
    useEffect(() => {
        verificarAlertasFinancierasRef.current      = verificarAlertasFinancieras;
        verificarAlertasGastosFijosRef.current      = verificarAlertasGastosFijos;
        verificarAlertaConcentracionRef.current     = verificarAlertaConcentracionCategoria;
        verificarProyeccionesRef.current            = verificarProyecciones;
        generarResumenDiarioRef.current             = generarResumenDiario;
        generarResumenSemanalRef.current            = generarResumenSemanal;
        generarResumenMensualRef.current            = generarResumenMensual;
        configNotifRef.current                      = configNotif;
    }, [verificarAlertasFinancieras, verificarAlertasGastosFijos, verificarAlertaConcentracionCategoria, verificarProyecciones, generarResumenDiario, generarResumenSemanal, generarResumenMensual, configNotif]);

    // Gasto diario disponible calculado por verificarProyecciones
    const [gastoDiarioDisponible, setGastoDiarioDisponible] = useState(null);

    /**
     * Dispara resúmenes diario/semanal/mensual si el usuario los tiene habilitados por email.
     * Cada resumen se envía como máximo una vez por día usando el mismo throttle de localStorage.
     * El día de la semana determina si se dispara el semanal (lunes) y el mensual (día 1 del mes).
     * Se asigna a un ref para que fetchStats pueda llamarlo sin agregarlo a sus dependencias.
     */
    const dispararResumenesAutomaticos = useCallback((stats) => {
        const cfg = configNotifRef.current;
        if (!cfg?.email_habilitado) return;

        const hoy = new Date();
        const fechaHoy = hoy.toISOString().split('T')[0];

        // Leer el throttle compartido con el sistema de alertas
        let throttle = {};
        try {
            const raw = localStorage.getItem('notif_alertas_throttle');
            const parsed = JSON.parse(raw || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.getPrototypeOf(parsed) === Object.prototype) {
                throttle = parsed;
            }
        } catch { /* mantener throttle vacío */ }

        const puedeDisparar = (clave) => {
            if (throttle[clave] === fechaHoy) return false;
            throttle[clave] = fechaHoy;
            return true;
        };

        let modificado = false;

        if (cfg.email_resumen_diario && puedeDisparar('resumen_diario')) {
            generarResumenDiarioRef.current(stats);
            modificado = true;
        }

        // Resumen semanal: lunes de cada semana
        if (cfg.email_resumen_semanal && hoy.getDay() === 1 && puedeDisparar('resumen_semanal')) {
            generarResumenSemanalRef.current(stats);
            modificado = true;
        }

        // Resumen mensual: primer día del mes
        if (cfg.email_resumen_mensual && hoy.getDate() === 1 && puedeDisparar('resumen_mensual')) {
            generarResumenMensualRef.current(stats);
            modificado = true;
        }

        if (modificado) {
            try {
                localStorage.setItem('notif_alertas_throttle', JSON.stringify(throttle));
            } catch { /* ignorar fallo de storage */ }
        }
    }, []);
    // Mantener el ref sincronizado para que fetchStats lo use sin dependencia directa
    dispararResumenesRef.current = dispararResumenesAutomaticos;

    // Control de los modales de la UI
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

    // Datos de los combos dinámicos (categorías y métodos de pago)
    const [categories, setCategories] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    // Estado del formulario de nuevo gasto
    const [expenseForm, setExpenseForm] = useState(ESTADO_INICIAL_GASTO);
    const [errorForm, setErrorForm] = useState(null);

    // Estado del panel de ingresos
    const INCOME_FORM_INICIAL = { monto: '', descripcion: '', categoria_id: '', es_recurrente: false };
    const [ingresosMes, setIngresosMes]             = useState([]);
    const [recurrentes, setRecurrentes]             = useState([]);
    const [categoriaIngresos, setCategoriaIngresos] = useState([]);
    const [incomeForm, setIncomeForm]               = useState(INCOME_FORM_INICIAL);
    const [incomeEditando, setIncomeEditando]       = useState(null);
    const [incomeConfirmDelete, setIncomeConfirmDelete] = useState(null);

    // Grupos de cuotas para la card de tarjeta de crédito
    const [cuotasGrupos, setCuotasGrupos] = useState([]);
    // Grupos de cuotas futuras para la card de gastos del mes siguiente
    const [gastosFuturos, setGastosFuturos] = useState([]);
    // Grupos de préstamos en cuotas
    const [prestamosGrupos, setPrestamosGrupos] = useState([]);
    const [prestamosFuturos, setPrestamosFuturos] = useState([]);

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
                verificarAlertasFinancierasRef.current(data);
                verificarAlertasGastosFijosRef.current(data);
                verificarAlertaConcentracionRef.current(data);
                verificarProyeccionesRef.current(data).then(proyeccion => {
                    if (proyeccion?.gastoDiarioDisponible !== undefined) {
                        setGastoDiarioDisponible(proyeccion.gastoDiarioDisponible);
                    }
                }).catch(e => console.error('❌ Error al verificar proyecciones:', e));
                // Disparar resúmenes automáticos si el usuario los tiene habilitados.
                // Usa el mismo throttle de localStorage para enviar cada resumen como máximo una vez por día.
                dispararResumenesRef.current?.(data);
            }
        } catch (err) {
            console.error('❌ Error al obtener estadísticas:', err);
            setErrorCarga('No se pudieron cargar los datos. Intentá recargar la página.');
        } finally {
            setCargando(false);
            if (primeraVez.current) {
                primeraVez.current = false;
                setAppReady(true);
            }
        }
    }, [setAppReady]);

    /**
     * Obtiene las categorías y métodos de pago disponibles.
     * Se usa para poblar los selects del formulario de nuevos gastos.
     */
    const fetchOpciones = useCallback(async () => {
        try {
            const [cats, metodos, cuotas, catIngresos, futuros, prestamos, prestamosFut] = await Promise.all([
                db.getCategories(),
                db.getPaymentMethods(),
                getTarjetasEnCuotas(),
                db.getIncomeCategories(),
                getGastosFuturos(),
                getPrestamosEnCuotas(),
                getPrestamosGastosFuturos(),
            ]);
            setCategories(cats);
            setPaymentMethods(metodos);
            setCuotasGrupos(cuotas);
            setPrestamosGrupos(prestamos);
            setPrestamosFuturos(prestamosFut);
            setCategoriaIngresos(catIngresos);
            setGastosFuturos(futuros);
        } catch (err) {
            console.error('❌ Error al obtener opciones:', err);
        }
    }, []);

    /** Carga los ingresos del mes actual para mostrar en el panel. */
    const fetchIngresosMes = useCallback(async () => {
        try {
            const hoy = new Date();
            const data = await db.getIncomesByMonth(hoy.getFullYear(), hoy.getMonth() + 1);
            setIngresosMes(data);
        } catch (err) {
            console.error('❌ Error al obtener ingresos del mes:', err);
        }
    }, []);

    /** Carga ingresos recurrentes del usuario. */
    const fetchRecurrentes = useCallback(async () => {
        try {
            const data = await db.getRecurringIncomes();
            setRecurrentes(data);
        } catch (err) {
            console.error('❌ Error al obtener recurrentes:', err);
        }
    }, []);

    useEffect(() => {
        fetchStats({ verificarAlertas: true });
        fetchOpciones();
        fetchIngresosMes();
    }, [fetchStats, fetchOpciones, fetchIngresosMes]);

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
        setErrorForm(null);

        // Validar que todos los campos requeridos estén completos
        if (!expenseForm.descripcion || !expenseForm.descripcion.trim()) {
            setErrorForm('Ingresá una descripción para el gasto.');
            return;
        }

        if (!expenseForm.monto || Number(expenseForm.monto) <= 0) {
            setErrorForm('El monto debe ser mayor a cero.');
            return;
        }

        if (!expenseForm.id_categoria) {
            setErrorForm('Seleccioná una categoría.');
            return;
        }

        if (!expenseForm.id_metodo_pago) {
            setErrorForm('Seleccioná un método de pago.');
            return;
        }

        if ((expenseForm.esTarjetaCredito || expenseForm.esPrestamo) && !expenseForm.primeraCuota) {
            setErrorForm('Indicá en qué mes vence la primera cuota.');
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
            setErrorForm(null);
            // Recargar cuotas si el nuevo gasto es con tarjeta de crédito
            if (expenseForm.esTarjetaCredito) {
                Promise.all([getTarjetasEnCuotas(), getGastosFuturos()])
                    .then(([cuotas, futuros]) => { setCuotasGrupos(cuotas); setGastosFuturos(futuros); })
                    .catch(console.error);
            }
            // Recargar préstamos si el nuevo gasto es de categoría PRESTAMOS
            if (expenseForm.esPrestamo) {
                Promise.all([getPrestamosEnCuotas(), getPrestamosGastosFuturos()])
                    .then(([prest, prestFut]) => { setPrestamosGrupos(prest); setPrestamosFuturos(prestFut); })
                    .catch(console.error);
            }
            // Al recargar stats verificamos alertas de saldo y porcentaje
            await fetchStats({ verificarAlertas: true });
        } catch (err) {
            console.error('❌ Error al guardar gasto:', err);
            setErrorForm(err.message || 'No se pudo guardar el gasto. Intentá de nuevo.');
        }
    };

    /** Abre el panel de ingresos y carga los registros del mes y los recurrentes. */
    const handleAbrirIngresos = () => {
        setIncomeForm(INCOME_FORM_INICIAL);
        setIncomeEditando(null);
        setIsIncomeModalOpen(true);
        fetchIngresosMes();
        fetchRecurrentes();
    };

    /**
     * Guarda un ingreso. Si es_recurrente = true, crea/actualiza en ingresos_recurrentes
     * y también registra el movimiento real del mes. Si es_recurrente = false, solo registra
     * el movimiento puntual. La fecha siempre es hoy (transparente para el usuario).
     */
    const handleSaveIncome = async (e) => {
        e.preventDefault();
        const hoy = new Date();
        const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        try {
            if (incomeEditando) {
                await db.updateIncome(incomeEditando, {
                    monto:        incomeForm.monto,
                    descripcion:  incomeForm.descripcion,
                    categoria_id: incomeForm.categoria_id || null,
                });
                agregarNotificacion({ titulo: 'Ingreso actualizado', mensaje: `Ingreso de $${Number(incomeForm.monto).toLocaleString('es-AR')} modificado.`, tipo: 'info', origen: 'ingresos' });
            } else {
                // Si marcó recurrente, también lo registra en ingresos_recurrentes
                if (incomeForm.es_recurrente) {
                    await db.createRecurringIncome({
                        descripcion:  incomeForm.descripcion || 'Ingreso recurrente',
                        monto:        incomeForm.monto,
                        categoria_id: incomeForm.categoria_id || null,
                        fecha_inicio: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`,
                    });
                }
                await db.createIncome({
                    monto:        incomeForm.monto,
                    fecha:        fechaHoy,
                    descripcion:  incomeForm.descripcion,
                    categoria_id: incomeForm.categoria_id || null,
                });
                agregarNotificacion({ titulo: 'Ingreso registrado', mensaje: `Se registró un ingreso de $${Number(incomeForm.monto).toLocaleString('es-AR')}.`, tipo: 'success', origen: 'ingresos' });
            }
            setIncomeForm(INCOME_FORM_INICIAL);
            setIncomeEditando(null);
            setIsIncomeModalOpen(false);
            await Promise.all([fetchIngresosMes(), fetchRecurrentes(), fetchStats({ verificarAlertas: true })]);
        } catch (err) {
            console.error('❌ Error al guardar ingreso:', err);
            agregarNotificacion({
                titulo: 'Error al guardar ingreso',
                mensaje: err.message || 'No se pudo guardar el ingreso. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
        }
    };

    /** Carga los datos del ingreso seleccionado en el formulario para editar. */
    const handleEditarIngreso = (ingreso) => {
        setIncomeEditando(ingreso.id);
        setIncomeForm({
            monto:         String(ingreso.monto),
            descripcion:   ingreso.descripcion || '',
            categoria_id:  ingreso.categoria_id || '',
            es_recurrente: false,
        });
    };

    /** Elimina un ingreso puntual tras confirmación. */
    const handleEliminarIngreso = async (id) => {
        try {
            await db.deleteIncome(id);
            setIncomeConfirmDelete(null);
            agregarNotificacion({ titulo: 'Ingreso eliminado', mensaje: 'El ingreso fue eliminado del período.', tipo: 'warning', origen: 'ingresos' });
            await Promise.all([fetchIngresosMes(), fetchStats({ verificarAlertas: true })]);
        } catch (err) {
            console.error('❌ Error al eliminar ingreso:', err);
            agregarNotificacion({
                titulo: 'Error al eliminar ingreso',
                mensaje: 'No se pudo eliminar el ingreso. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
        }
    };

    /** Elimina o desactiva un recurrente tras confirmación. */
    const handleEliminarRecurrente = async (id) => {
        try {
            await db.deleteRecurringIncome(id);
            setIncomeConfirmDelete(null);
            agregarNotificacion({ titulo: 'Recurrente eliminado', mensaje: 'El ingreso recurrente fue eliminado.', tipo: 'warning', origen: 'ingresos' });
            await Promise.all([fetchRecurrentes()]);
        } catch (err) {
            console.error('❌ Error al eliminar recurrente:', err);
            agregarNotificacion({
                titulo: 'Error al eliminar recurrente',
                mensaje: 'No se pudo eliminar el ingreso recurrente. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
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
            agregarNotificacion({
                titulo: 'Error al eliminar',
                mensaje: 'No se pudieron eliminar los gastos variables. Intentá de nuevo.',
                tipo: 'error',
                origen: 'gastos',
            });
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

    // Detecta si el método de pago seleccionado es tarjeta de crédito y actualiza el estado
    const handleCambioMetodoPago = (id) => {
        const metodo = paymentMethods.find(pm => pm.id === Number(id) || pm.id === id);
        const esTarjeta = metodo?.nombre?.toUpperCase() === 'TARJETA DE CREDITO';
        setExpenseForm(prev => ({
            ...prev,
            id_metodo_pago: id,
            esTarjetaCredito: esTarjeta,
            // Al cambiar el método, reseteamos cuotas, primeraCuota y desbloqueamos es_fijo
            cuotas: 1,
            primeraCuota: '',
            es_fijo: esTarjeta ? true : prev.es_fijo,
        }));
    };

    // Detecta si la categoría seleccionada es PRESTAMOS y activa el modo cuotas
    const handleCambioCategoria = (id) => {
        const cat = categories.find(c => c.id === Number(id) || c.id === id);
        const esPrestamo = cat?.nombre?.toUpperCase() === 'PRESTAMOS';
        setExpenseForm(prev => ({
            ...prev,
            id_categoria: id,
            esPrestamo,
            // Al cambiar categoría, reseteamos cuotas y primeraCuota si ya no aplica
            cuotas: esPrestamo ? prev.cuotas : (prev.esPrestamo ? 1 : prev.cuotas),
            primeraCuota: esPrestamo ? prev.primeraCuota : (prev.esPrestamo ? '' : prev.primeraCuota),
            es_fijo: esPrestamo ? true : prev.es_fijo,
        }));
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
                    <button onClick={handleAbrirIngresos} className="btn btn-income">
                        <span className="material-symbols-outlined">account_balance</span>
                        <span>Ingresos</span>
                    </button>
                    <button onClick={handleAbrirNuevoGasto} className="btn btn-primary">
                        <span className="material-symbols-outlined">add</span>
                        <span>Nuevo Gasto</span>
                    </button>
                </div>
            </div>

            <div className="summary-panel">
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

            {/* Card unificada de tarjeta de crédito: mes en curso + mes siguiente */}
            <TarjetasCuotasCard grupos={cuotasGrupos} gastosFuturos={gastosFuturos} />

            {/* Card de préstamos en cuotas: solo se muestra si hay al menos un préstamo registrado */}
            {prestamosGrupos.length > 0 && (
                <PrestamosCard grupos={prestamosGrupos} gastosFuturos={prestamosFuturos} />
            )}

            {/* Botón de acción peligrosa: eliminar todos los gastos variables */}
            {/* <div className="dashboard-footer">
                <button onClick={() => setConfirmDeleteAll(true)} className="btn btn-danger-gradient">
                    <span className="material-symbols-outlined">delete_sweep</span>
                    <span>Eliminar gastos variables</span>
                </button>
            </div> */}

            {/* ========== MODALES ========== */}

            {/* Modal: Nuevo Gasto */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setErrorForm(null); }}
                title="Nuevo Gasto"
                subtitle="Completá los detalles del movimiento"
                footer={
                    <div className="form-row">
                        <button type="button" form="form-nuevo-gasto" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                            Cancelar
                        </button>
                        <button type="submit" form="form-nuevo-gasto" className="btn btn-primary" style={{ flex: 1 }}>
                            Guardar
                        </button>
                    </div>
                }
            >
                <form id="form-nuevo-gasto" onSubmit={handleSubmitExpense} className="form-container">
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
                                onChange={(e) => handleCambioCategoria(e.target.value)}
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
                                onChange={(e) => handleCambioMetodoPago(e.target.value)}
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
                    {expenseForm.esTarjetaCredito && (
                        <>
                        <div className="form-group">
                            <label className="form-label-box">Cuotas</label>
                            <select
                                value={expenseForm.cuotas}
                                onChange={(e) => setExpenseForm(prev => ({ ...prev, cuotas: parseInt(e.target.value) }))}
                                className="form-select"
                            >
                                {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
                                    <option key={n} value={n}>
                                        {n === 1 ? '1 cuota (pago único)' : `${n} cuotas`}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Mes de la primera cuota <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <input
                                type="month"
                                className="form-select"
                                value={expenseForm.primeraCuota}
                                onChange={(e) => setExpenseForm(prev => ({ ...prev, primeraCuota: e.target.value }))}
                                required
                            />
                            <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                                El 1° del mes elegido es la fecha de vencimiento de la primera cuota.
                            </small>
                        </div>
                        </>
                    )}
                    {expenseForm.esPrestamo && (
                        <>
                        <div className="form-group">
                            <label className="form-label-box">Cuotas</label>
                            <select
                                value={expenseForm.cuotas}
                                onChange={(e) => setExpenseForm(prev => ({ ...prev, cuotas: parseInt(e.target.value) }))}
                                className="form-select"
                            >
                                {Array.from({ length: 120 }, (_, i) => i + 1).map(n => (
                                    <option key={n} value={n}>
                                        {n === 1 ? '1 cuota (pago único)' : `${n} cuotas`}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Mes del primer pago <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <input
                                type="month"
                                className="form-select"
                                value={expenseForm.primeraCuota}
                                onChange={(e) => setExpenseForm(prev => ({ ...prev, primeraCuota: e.target.value }))}
                                required
                            />
                            <small style={{ color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                                El 1° del mes elegido es la fecha del primer pago del préstamo.
                            </small>
                        </div>
                        </>
                    )}
                    {!expenseForm.esTarjetaCredito && !expenseForm.esPrestamo && (
                        <div className="form-checkbox-group">
                            <input
                                type="checkbox"
                                id="es_fijo"
                                checked={expenseForm.es_fijo}
                                onChange={(e) => setExpenseForm(prev => ({ ...prev, es_fijo: e.target.checked }))}
                            />
                            <label htmlFor="es_fijo">Gasto Fijo</label>
                        </div>
                    )}
                    {errorForm && (
                        <p className="edit-form-error" role="alert">{errorForm}</p>
                    )}
                </form>
            </Modal>

            {/* Modal: Ingresos */}
            <Modal
                isOpen={isIncomeModalOpen}
                onClose={() => { setIsIncomeModalOpen(false); setIncomeEditando(null); }}
                title="Ingresos"
                subtitle="Registrá tus ingresos del mes"
                disableClose={!!incomeConfirmDelete}
            >
                <div className="form-container">
                    <form onSubmit={handleSaveIncome}>
                        <div className="form-group">
                            <label className="form-label-box">Monto</label>
                            <CurrencyInput
                                key={`income-${incomeEditando ?? 'new'}`}
                                value={incomeForm.monto}
                                onChange={(val) => setIncomeForm(prev => ({ ...prev, monto: val }))}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Descripción (opcional)</label>
                            <input
                                type="text"
                                value={incomeForm.descripcion}
                                onChange={(e) => setIncomeForm(prev => ({ ...prev, descripcion: e.target.value }))}
                                className="input"
                                placeholder="Ej: Sueldo"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Categoría (opcional)</label>
                            <select
                                value={incomeForm.categoria_id}
                                onChange={(e) => setIncomeForm(prev => ({ ...prev, categoria_id: e.target.value }))}
                                className="form-select"
                            >
                                <option value="">Sin categoría</option>
                                {categoriaIngresos.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>
                        {/* Solo mostrar checkbox recurrente al crear, no al editar */}
                        {!incomeEditando && (
                            <div className="form-checkbox-group">
                                <input
                                    type="checkbox"
                                    id="es_recurrente"
                                    checked={incomeForm.es_recurrente}
                                    onChange={(e) => setIncomeForm(prev => ({ ...prev, es_recurrente: e.target.checked }))}
                                />
                                <label htmlFor="es_recurrente">Ingreso recurrente (se repite cada mes)</label>
                            </div>
                        )}
                        <div className="form-row" style={{ marginTop: '8px' }}>
                            {incomeEditando && (
                                <button
                                    type="button"
                                    onClick={() => { setIncomeEditando(null); setIncomeForm(INCOME_FORM_INICIAL); }}
                                    className="btn btn-secondary"
                                    style={{ flex: 1 }}
                                >
                                    Cancelar
                                </button>
                            )}
                            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                {incomeEditando ? 'Actualizar' : 'Agregar ingreso'}
                            </button>
                        </div>
                    </form>

                    {/* Lista de ingresos del mes */}
                    {ingresosMes.length > 0 && (
                        <div style={{ marginTop: '20px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Ingresos de este mes
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {ingresosMes.map(ing => (
                                    <div key={ing.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', border: incomeEditando === ing.id ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--success)' }}>
                                                ${Number(ing.monto).toLocaleString('es-AR')}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                {ing.descripcion || 'Sin descripción'}{ing.categorias_ingresos?.nombre ? ` · ${ing.categorias_ingresos.nombre}` : ''}
                                                {ing.recurrente_id && <span style={{ marginLeft: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '4px' }}>recurrente</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', marginLeft: '10px' }}>
                                            <button type="button" onClick={() => handleEditarIngreso(ing)} className="btn btn-secondary" style={{ padding: '4px 8px' }} title="Editar">
                                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                                            </button>
                                            <button type="button" onClick={() => setIncomeConfirmDelete(ing.id)} className="btn btn-danger-gradient" style={{ padding: '4px 8px' }} title="Eliminar">
                                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Total del mes</span>
                                <span style={{ fontWeight: 700, color: 'var(--success)' }}>
                                    ${ingresosMes.reduce((s, i) => s + Number(i.monto), 0).toLocaleString('es-AR')}
                                </span>
                            </div>
                        </div>
                    )}
                    {ingresosMes.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', marginTop: '16px', padding: '12px' }}>
                            Todavía no registraste ingresos este mes.
                        </div>
                    )}

                    {/* Lista de recurrentes activos — informativo */}
                    {recurrentes.filter(r => r.activo).length > 0 && (
                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Recurrentes configurados
                            </div>
                            {recurrentes.filter(r => r.activo).map(rec => (
                                <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', color: 'var(--text-secondary)' }}>
                                    <span>{rec.descripcion}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: 'var(--success)' }}>${Number(rec.monto).toLocaleString('es-AR')}/mes</span>
                                        <button type="button" onClick={() => setIncomeConfirmDelete(`rec-${rec.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0' }} title="Eliminar recurrente">
                                            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>close</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Confirm: eliminar ingreso o recurrente */}
            {!!incomeConfirmDelete && (
                <ConfirmModal
                    isOpen={true}
                    onClose={() => setIncomeConfirmDelete(null)}
                    onConfirm={() => {
                        const id = incomeConfirmDelete;
                        if (typeof id === 'string' && id.startsWith('rec-')) {
                            handleEliminarRecurrente(Number(id.replace('rec-', '')));
                        } else {
                            handleEliminarIngreso(id);
                        }
                    }}
                    title={typeof incomeConfirmDelete === 'string' && incomeConfirmDelete.startsWith('rec-') ? 'Eliminar recurrente' : 'Eliminar ingreso'}
                    message={typeof incomeConfirmDelete === 'string' && incomeConfirmDelete.startsWith('rec-') ? 'Se eliminarán los próximos registros automáticos de este ingreso recurrente.' : '¿Querés eliminar este ingreso? El total del mes se recalculará.'}
                />
            )}

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
