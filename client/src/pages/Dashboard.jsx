import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import * as db from '../lib/db';
import { getTarjetasEnCuotas, getGastosFuturos, getPrestamosEnCuotas, getPrestamosGastosFuturos } from '../lib/db';
import SummaryCard from '../components/dashboard/SummaryCard';
import DashboardTable from '../components/dashboard/DashboardTable';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';
import TarjetasCuotasCard from '../components/dashboard/TarjetasCuotasCard';
import PrestamosCard from '../components/dashboard/PrestamosCard';
import GastoWizard from '../components/dashboard/GastoWizard';
import IngresoModal from '../components/dashboard/IngresoModal';
import { useNotificaciones } from '../context/NotificacionesContext';
import { useAppReady } from '../context/AppReadyContext';

// ==================== ESTADO INICIAL ====================

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

    // Gasto diario disponible: dato derivado de stats, se recalcula solo con cada actualización
    // (no depende de notificaciones ni de ingresoMensual > 0 — es puro saldoDisponible / días restantes).
    const gastoDiarioDisponible = useMemo(() => {
        const ahora = new Date();
        const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
        const diasRestantes = diasEnMes - ahora.getDate();
        if (diasRestantes <= 0) return null;
        return Math.max(0, stats.saldoDisponible / diasRestantes);
    }, [stats.saldoDisponible]);

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

    // Ocultar importes del summary-panel — activado por defecto para privacidad
    const [importesOcultos, setImportesOcultos] = useState(true);

    // Control de los modales de la UI
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    // Tipo fijo/variable preseleccionado al abrir el wizard desde la fila "Gastos Fijos/Variables"
    // del summary-panel (ver handleAbrirNuevoGastoConTipo). null cuando se abre "en blanco"
    // (ver handleAbrirNuevoGasto) y el wizard pide el tipo en su paso 3.
    const [gastoTipoPreset, setGastoTipoPreset] = useState(null);

    // Datos de los combos dinámicos (categorías y métodos de pago)
    const [categories, setCategories] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [errorOpciones, setErrorOpciones] = useState(null);

    // Catálogo de categorías de ingreso — el resto del estado del panel de ingresos
    // (listas, form, vista, paso, fase) vive dentro de IngresoModal.
    const [categoriaIngresos, setCategoriaIngresos] = useState([]);

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
    const fetchStats = useCallback(async ({ verificarAlertas = false, mostrarSkeleton = true } = {}) => {
        try {
            // El skeleton de pantalla completa solo debe verse en la carga inicial del dashboard.
            // Las recargas disparadas por guardar/editar/eliminar (con un modal ya abierto encima)
            // no deben desmontar la página entera — eso se llevaba puesto cualquier modal abierto,
            // incluido el popup de resultado del alta de gasto.
            if (mostrarSkeleton) setCargando(true);
            if (mostrarSkeleton) setErrorCarga(null);
            const data = await db.getStats();
            setStats(data);
            if (verificarAlertas) {
                verificarAlertasFinancierasRef.current(data);
                verificarAlertasGastosFijosRef.current(data);
                verificarAlertaConcentracionRef.current(data);
                verificarProyeccionesRef.current(data).catch(e => console.error('❌ Error al verificar proyecciones:', e));
                // Disparar resúmenes automáticos si el usuario los tiene habilitados.
                // Usa el mismo throttle de localStorage para enviar cada resumen como máximo una vez por día.
                dispararResumenesRef.current?.(data);
            }
        } catch (err) {
            console.error('❌ Error al obtener estadísticas:', err);
            // Con mostrarSkeleton=false hay un modal/popup abierto encima del dashboard (ej. resultado
            // de guardar un gasto): no lo tapamos con la pantalla de error de carga completa, el error
            // ya quedó logueado y las stats simplemente no se refrescaron esta vez.
            if (mostrarSkeleton) setErrorCarga('No se pudieron cargar los datos. Intentá recargar la página.');
        } finally {
            if (mostrarSkeleton) setCargando(false);
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
            setErrorOpciones(null);
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
            setErrorOpciones('No se pudieron cargar las categorías y métodos de pago.');
        }
    }, []);

    useEffect(() => {
        fetchStats({ verificarAlertas: true });
        fetchOpciones();
    }, [fetchStats, fetchOpciones]);

    // Cuando el FAB del bottom nav mobile dispara onNewExpense, abrimos el modal.
    // Usamos handleAbrirNuevoGasto (no setIsModalOpen directo) para que este camino
    // también resetee wizard/formulario/fase — evita mostrar el resultado de una
    // sesión anterior si el usuario cerró el modal desde el paso 'resultado'.
    useEffect(() => {
        if (showNewExpense) {
            handleAbrirNuevoGasto();
            setShowNewExpense?.(false);
        }
    }, [showNewExpense, setShowNewExpense]);

    // ==================== HANDLERS ====================

    /**
     * Reacciona al guardado exitoso de un gasto en GastoWizard: dispara la notificación de alta,
     * verifica la alerta de gasto alto, recarga cuotas/préstamos si corresponde y recarga stats.
     * GastoWizard ya hizo el db.createExpense y actualizó su propia fase a 'resultado' antes
     * de llamar a este callback — acá solo reaccionamos con los efectos que le pertenecen al Dashboard.
     */
    const handleGastoGuardado = async ({ descripcionMostrada, monto, esTarjetaCredito, esPrestamo }) => {
        agregarNotificacion({
            titulo:  'Gasto registrado',
            mensaje: `Se registró "${descripcionMostrada}" por $${Number(monto).toLocaleString('es-AR')}.`,
            tipo:    'success',
            origen:  'manual',
        });
        // Verificar si el gasto supera el umbral de gasto alto
        verificarAlertaGastoAlto({ descripcion: descripcionMostrada, monto });
        // Recargar cuotas si el nuevo gasto es con tarjeta de crédito
        if (esTarjetaCredito) {
            Promise.all([getTarjetasEnCuotas(), getGastosFuturos()])
                .then(([cuotas, futuros]) => { setCuotasGrupos(cuotas); setGastosFuturos(futuros); })
                .catch(console.error);
        }
        // Recargar préstamos si el nuevo gasto es de categoría PRESTAMOS
        if (esPrestamo) {
            Promise.all([getPrestamosEnCuotas(), getPrestamosGastosFuturos()])
                .then(([prest, prestFut]) => { setPrestamosGrupos(prest); setPrestamosFuturos(prestFut); })
                .catch(console.error);
        }
        // Al recargar stats verificamos alertas de saldo y porcentaje. Sin skeleton: el modal
        // de resultado ya está mostrándose y no debe desmontarse mientras recargamos en segundo plano.
        await fetchStats({ verificarAlertas: true, mostrarSkeleton: false });
    };

    /**
     * Cierra el modal de alta de gasto. No reseteamos nada del wizard acá: el modal tarda ~300ms
     * en desvanecerse (ver Modal.jsx) y GastoWizard resetea su propio estado recién cuando vuelve
     * a abrirse (ver su efecto sobre isOpen), para no mostrar el wizard vacío destellando durante
     * ese fade-out en vez de mantener el popup de resultado hasta que termine de cerrarse.
     */
    const handleCerrarModalGasto = () => {
        setIsModalOpen(false);
    };

    /** Abre el panel de ingresos. IngresoModal carga sus propios datos al detectar isOpen. */
    const handleAbrirIngresos = () => {
        setIsIncomeModalOpen(true);
    };

    /** Abre el wizard de gasto en blanco (pide tipo fijo/variable en su paso 3). */
    const handleAbrirNuevoGasto = () => {
        setGastoTipoPreset(null);
        setIsModalOpen(true);
    };

    /** Abre el wizard de gasto con el tipo (fijo/variable) ya definido, saltando ese paso. */
    const handleAbrirNuevoGastoConTipo = (esFijo) => {
        setGastoTipoPreset(esFijo);
        setIsModalOpen(true);
    };

    // Gastos separados por tipo para las tablas inferiores
    const gastosRecientes = useMemo(() => stats.gastos.filter(g => !g.es_fijo).slice(0, 5), [stats.gastos]);
    const gastosFijos = useMemo(() => stats.gastos.filter(g => g.es_fijo), [stats.gastos]);

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
                <button
                    onClick={() => setImportesOcultos(v => !v)}
                    className="btn btn-secondary btn-toggle-amounts"
                    title={importesOcultos ? 'Mostrar importes' : 'Ocultar importes'}
                    aria-label={importesOcultos ? 'Mostrar importes' : 'Ocultar importes'}
                >
                    <span className="material-symbols-outlined">
                        {importesOcultos ? 'visibility' : 'visibility_off'}
                    </span>
                    <span className="btn-toggle-amounts__label">
                        {importesOcultos ? 'Mostrar importes' : 'Ocultar importes'}
                    </span>
                </button>
            </div>

            {/* Filas clickeables: cada una abre el wizard correspondiente ya preseteado.
                Ingresos ocupa fila propia; Fijos/Variables comparten la fila de abajo. */}
            <div className="summary-panel summary-panel--carga">
                <SummaryCard
                    title="Ingresos"
                    amount={stats.ingresoMensual}
                    icon="trending_up"
                    color="success"
                    subtitle="Ingreso registrado"
                    hidden={importesOcultos}
                    onClick={handleAbrirIngresos}
                />
                <SummaryCard
                    title="Gastos Fijos"
                    amount={stats.gastosFijos}
                    icon="lock"
                    color="warning"
                    subtitle="Compromisos del mes"
                    hidden={importesOcultos}
                    onClick={() => handleAbrirNuevoGastoConTipo(true)}
                />
                <SummaryCard
                    title="Gastos Variables"
                    amount={stats.gastosVariables}
                    icon="payments"
                    color="danger"
                    subtitle="Gastos discrecionales"
                    hidden={importesOcultos}
                    onClick={() => handleAbrirNuevoGastoConTipo(false)}
                />
            </div>

            {/* Métricas de resultado: solo lectura, sin acción de carga */}
            <div className="summary-panel">
                <SummaryCard
                    title="Saldo Disponible"
                    amount={stats.saldoDisponible}
                    icon="account_balance_wallet"
                    color="primary"
                    dominant
                    subtitle={stats.saldoDisponible >= 0 ? 'Estás en positivo' : 'Superaste el ingreso'}
                    hidden={importesOcultos}
                />
                {gastoDiarioDisponible !== null && (
                    <SummaryCard
                        title="Disponible por día"
                        amount={gastoDiarioDisponible}
                        icon="calendar_today"
                        color={gastoDiarioDisponible > 0 ? 'primary' : 'danger'}
                        subtitle="Hasta fin de mes"
                        hidden={importesOcultos}
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

            {/* Card unificada de tarjeta de crédito: mes en curso + mes siguiente.
                Solo se muestra si hay al menos una compra en cuotas registrada (mismo criterio que PrestamosCard). */}
            {cuotasGrupos.length > 0 && (
                <TarjetasCuotasCard grupos={cuotasGrupos} gastosFuturos={gastosFuturos} />
            )}

            {/* Card de préstamos en cuotas: solo se muestra si hay al menos un préstamo registrado */}
            {prestamosGrupos.length > 0 && (
                <PrestamosCard grupos={prestamosGrupos} gastosFuturos={prestamosFuturos} />
            )}


            {/* ========== MODALES ========== */}

            {/* Modal: Nuevo Gasto (wizard de 3 pasos: monto/descripción → categoría/método/cuotas → fijo/variable) */}
            <GastoWizard
                isOpen={isModalOpen}
                onClose={handleCerrarModalGasto}
                categories={categories}
                paymentMethods={paymentMethods}
                errorOpciones={errorOpciones}
                fetchOpciones={fetchOpciones}
                tipoPreseleccionado={gastoTipoPreset !== null}
                esFijoPreseleccionado={!!gastoTipoPreset}
                onGastoGuardado={handleGastoGuardado}
            />

            {/* Modal: Ingresos (lista + wizard de alta/edición, con su ConfirmModal de eliminar) */}
            <IngresoModal
                isOpen={isIncomeModalOpen}
                onClose={() => setIsIncomeModalOpen(false)}
                categoriaIngresos={categoriaIngresos}
                onIngresoGuardado={() => fetchStats({ verificarAlertas: true, mostrarSkeleton: false })}
            />

        </div>
    );
};

export default Dashboard;
