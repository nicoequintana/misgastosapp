import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import CurrencyInput from '../components/CurrencyInput';
import ChipSelector from '../components/ChipSelector';
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

/** Estado inicial vacío para el formulario de ingresos */
const INCOME_FORM_INICIAL = { monto: '', descripcion: '', categoria_id: '', es_recurrente: false };

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

// Opciones estáticas de cuotas — se definen fuera del componente para evitar recrearlas en cada render
const OPCIONES_CUOTAS_TARJETA = Array.from({ length: 18 }, (_, i) => i + 1);
const OPCIONES_CUOTAS_PRESTAMO = Array.from({ length: 120 }, (_, i) => i + 1);

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

    // Ocultar importes del summary-panel — activado por defecto para privacidad
    const [importesOcultos, setImportesOcultos] = useState(true);

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
    // Paso actual del wizard de carga (1: monto/descripción, 2: categoría/método/cuotas, 3: fijo/variable)
    const [pasoGasto, setPasoGasto] = useState(1);
    // Se activa brevemente al cambiar de paso, para deshabilitar los botones de navegación
    // del footer. Evita que un click sobre "Siguiente" recaiga por error sobre "Guardar"
    // cuando este último ocupa la misma posición del footer tras el cambio de paso.
    const [botonesPasoBloqueados, setBotonesPasoBloqueados] = useState(false);
    // Popup de resultado inmediato tras crear el gasto (éxito o error) — convive con
    // el historial persistente de NotificacionesContext, no lo reemplaza.
    const [resultadoGasto, setResultadoGasto] = useState(null);
    // Fase visual del modal de alta de gasto: 'form' (wizard), 'guardando' (spinner
    // mientras corre createExpense) o 'resultado' (popup de éxito/error). Todo dentro
    // del mismo modal para evitar el corte de cerrar+abrir dos modales distintos.
    const [faseGasto, setFaseGasto] = useState('form');

    // Estado del panel de ingresos
    const [ingresosMes, setIngresosMes]             = useState([]);
    const [recurrentes, setRecurrentes]             = useState([]);
    const [categoriaIngresos, setCategoriaIngresos] = useState([]);
    const [incomeForm, setIncomeForm]               = useState(INCOME_FORM_INICIAL);
    const [incomeEditando, setIncomeEditando]       = useState(null);
    const [incomeConfirmDelete, setIncomeConfirmDelete] = useState(null);
    // Fase visual del modal de Ingresos: 'form' (formulario+lista), 'guardando' (spinner
    // mientras corre la acción) o 'resultado' (popup de éxito/error). A diferencia del
    // modal de gastos, acá el modal NO se cierra al llegar a 'resultado' — es un panel
    // persistente pensado para cargar varios ingresos seguidos.
    const [faseIngreso, setFaseIngreso] = useState('form');
    const [resultadoIngreso, setResultadoIngreso] = useState(null);
    // Vista del modal de Ingresos: 'lista' (ingresos del mes + recurrentes + botón "Nuevo
    // ingreso") o 'wizard' (formulario de alta/edición en 2 pasos). Reemplaza el formulario
    // siempre-visible anterior por un flujo de wizard, igual que el modal de gastos.
    const [vistaIngreso, setVistaIngreso] = useState('lista');
    // Paso actual del wizard de ingreso (1: monto/descripción, 2: categoría/tipo)
    const [pasoIngreso, setPasoIngreso] = useState(1);
    // Mismo mecanismo que botonesPasoBloqueados en el wizard de gastos: evita que un click
    // sobre "Siguiente" recaiga por error sobre "Guardar" cuando este último ocupa la misma
    // posición del footer tras avanzar al último paso.
    const [botonesPasoIngresoBloqueados, setBotonesPasoIngresoBloqueados] = useState(false);
    const [errorIngresoForm, setErrorIngresoForm] = useState(null);

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

    // Bloquea brevemente los botones de navegación del wizard al cambiar de paso.
    // Evita que un click sobre "Siguiente" recaiga por error sobre "Guardar" cuando
    // este último ocupa la misma posición del footer tras avanzar al último paso.
    useEffect(() => {
        setBotonesPasoBloqueados(true);
        const timer = setTimeout(() => setBotonesPasoBloqueados(false), 400);
        return () => clearTimeout(timer);
    }, [pasoGasto]);

    // Mismo mecanismo que el de arriba, aplicado al wizard de ingresos.
    useEffect(() => {
        setBotonesPasoIngresoBloqueados(true);
        const timer = setTimeout(() => setBotonesPasoIngresoBloqueados(false), 400);
        return () => clearTimeout(timer);
    }, [pasoIngreso]);

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

        // El form del wizard solo se submitea de verdad en el último paso (botón "Guardar").
        // Si el submit llega antes (ej. Enter en un campo de un paso intermedio), avanzamos
        // de paso en vez de guardar el gasto a medio completar.
        if (pasoGasto < totalPasosGasto) {
            handleSiguientePaso();
            return;
        }

        // Validar que todos los campos requeridos estén completos (la descripción es opcional)
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

        // A partir de acá el form es válido: mostramos el spinner en el mismo modal
        // en vez de cerrar el wizard y abrir un popup aparte.
        setFaseGasto('guardando');

        try {
            // La descripción es opcional: si el usuario no escribió nada, usamos un texto genérico
            // para la notificación (la persistencia del default real ocurre en db.createExpense).
            const descripcionMostrada = expenseForm.descripcion?.trim() || 'SIN DESCRIPCIÓN';
            // La fecha del gasto siempre es la del día de carga — no es un campo editable del form.
            // Se recalcula acá (no solo en el estado inicial) por si el modal quedó abierto de un día para el otro.
            await db.createExpense({ ...expenseForm, fecha: fechaHoyArgentina() });
            console.log('✅ Gasto creado correctamente');
            agregarNotificacion({
                titulo:  'Gasto registrado',
                mensaje: `Se registró "${descripcionMostrada}" por $${Number(expenseForm.monto).toLocaleString('es-AR')}.`,
                tipo:    'success',
                origen:  'manual',
            });
            setResultadoGasto({ tipo: 'success', titulo: '¡Gasto registrado!' });
            setFaseGasto('resultado');
            // Verificar si el gasto supera el umbral de gasto alto
            verificarAlertaGastoAlto({ descripcion: descripcionMostrada, monto: expenseForm.monto });
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
            // Al recargar stats verificamos alertas de saldo y porcentaje. Sin skeleton: el modal
            // de resultado ya está mostrándose y no debe desmontarse mientras recargamos en segundo plano.
            await fetchStats({ verificarAlertas: true, mostrarSkeleton: false });
        } catch (err) {
            console.error('❌ Error al guardar gasto:', err);
            setResultadoGasto({ tipo: 'error', titulo: 'No se pudo guardar el gasto', mensaje: err.message });
            setFaseGasto('resultado');
        }
    };

    /**
     * Cierra el modal de alta de gasto. No resetea wizard/formulario/fase acá: el modal
     * tarda ~300ms en desvanecerse (ver Modal.jsx), y si reseteáramos faseGasto a 'form'
     * en este mismo click, se alcanzaría a ver el wizard vacío destellando durante ese
     * fade-out en vez de mantener el popup de resultado hasta que termine de cerrarse.
     * El reset real ocurre en handleAbrirNuevoGasto, la próxima vez que se abre el modal.
     */
    const handleCerrarModalGasto = () => {
        setIsModalOpen(false);
    };

    /** Abre el panel de ingresos y carga los registros del mes y los recurrentes. */
    const handleAbrirIngresos = () => {
        setIncomeForm(INCOME_FORM_INICIAL);
        setIncomeEditando(null);
        setFaseIngreso('form');
        setResultadoIngreso(null);
        setVistaIngreso('lista');
        setPasoIngreso(1);
        setErrorIngresoForm(null);
        setIsIncomeModalOpen(true);
        fetchIngresosMes();
        fetchRecurrentes();
    };

    /** Abre el wizard de alta de ingreso desde la vista de lista, con el formulario vacío. */
    const handleAbrirWizardIngreso = () => {
        setIncomeForm(INCOME_FORM_INICIAL);
        setIncomeEditando(null);
        setPasoIngreso(1);
        setErrorIngresoForm(null);
        setVistaIngreso('wizard');
    };

    /**
     * Guarda un ingreso. Si es_recurrente = true, crea/actualiza en ingresos_recurrentes
     * y también registra el movimiento real del mes. Si es_recurrente = false, solo registra
     * el movimiento puntual. La fecha siempre es hoy (transparente para el usuario).
     */
    const handleSaveIncome = async (e) => {
        e.preventDefault();
        // El form del wizard solo se submitea de verdad en el paso 2 (botón "Agregar
        // ingreso"/"Actualizar"). Si el submit llega antes (ej. Enter en el input de
        // Monto del paso 1), avanzamos de paso en vez de guardar a medio completar.
        if (pasoIngreso < 2) {
            handleSiguientePasoIngreso();
            return;
        }
        const hoy = new Date();
        const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        setFaseIngreso('guardando');
        try {
            if (incomeEditando) {
                await db.updateIncome(incomeEditando, {
                    monto:        incomeForm.monto,
                    descripcion:  incomeForm.descripcion,
                    categoria_id: incomeForm.categoria_id || null,
                });
                agregarNotificacion({ titulo: 'Ingreso actualizado', mensaje: `Ingreso de $${Number(incomeForm.monto).toLocaleString('es-AR')} modificado.`, tipo: 'info', origen: 'ingresos' });
                setResultadoIngreso({ tipo: 'success', titulo: 'Ingreso actualizado' });
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
                setResultadoIngreso({ tipo: 'success', titulo: '¡Ingreso registrado!' });
            }
            setFaseIngreso('resultado');
            await Promise.all([fetchIngresosMes(), fetchRecurrentes(), fetchStats({ verificarAlertas: true, mostrarSkeleton: false })]);
        } catch (err) {
            console.error('❌ Error al guardar ingreso:', err);
            agregarNotificacion({
                titulo: 'Error al guardar ingreso',
                mensaje: err.message || 'No se pudo guardar el ingreso. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
            setResultadoIngreso({ tipo: 'error', titulo: 'No se pudo guardar el ingreso', mensaje: err.message });
            setFaseIngreso('resultado');
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
        setPasoIngreso(1);
        setErrorIngresoForm(null);
        setVistaIngreso('wizard');
    };

    /** Elimina un ingreso puntual tras confirmación. */
    const handleEliminarIngreso = async (id) => {
        setIncomeConfirmDelete(null);
        setFaseIngreso('guardando');
        try {
            await db.deleteIncome(id);
            agregarNotificacion({ titulo: 'Ingreso eliminado', mensaje: 'El ingreso fue eliminado del período.', tipo: 'warning', origen: 'ingresos' });
            setResultadoIngreso({ tipo: 'success', titulo: 'Ingreso eliminado' });
            setFaseIngreso('resultado');
            await Promise.all([fetchIngresosMes(), fetchStats({ verificarAlertas: true, mostrarSkeleton: false })]);
        } catch (err) {
            console.error('❌ Error al eliminar ingreso:', err);
            agregarNotificacion({
                titulo: 'Error al eliminar ingreso',
                mensaje: 'No se pudo eliminar el ingreso. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
            setResultadoIngreso({ tipo: 'error', titulo: 'No se pudo eliminar el ingreso' });
            setFaseIngreso('resultado');
        }
    };

    /** Elimina o desactiva un recurrente tras confirmación. */
    const handleEliminarRecurrente = async (id) => {
        setIncomeConfirmDelete(null);
        setFaseIngreso('guardando');
        try {
            await db.deleteRecurringIncome(id);
            agregarNotificacion({ titulo: 'Recurrente eliminado', mensaje: 'El ingreso recurrente fue eliminado.', tipo: 'warning', origen: 'ingresos' });
            setResultadoIngreso({ tipo: 'success', titulo: 'Recurrente eliminado' });
            setFaseIngreso('resultado');
            await Promise.all([fetchRecurrentes()]);
        } catch (err) {
            console.error('❌ Error al eliminar recurrente:', err);
            agregarNotificacion({
                titulo: 'Error al eliminar recurrente',
                mensaje: 'No se pudo eliminar el ingreso recurrente. Intentá de nuevo.',
                tipo: 'error',
                origen: 'ingresos',
            });
            setResultadoIngreso({ tipo: 'error', titulo: 'No se pudo eliminar el recurrente' });
            setFaseIngreso('resultado');
        }
    };

    /** Valida los campos del paso actual del wizard de ingreso antes de dejar avanzar. */
    const validarPasoIngreso = (paso) => {
        if (paso === 1) {
            if (!incomeForm.monto || Number(incomeForm.monto) <= 0) {
                return 'El monto debe ser mayor a cero.';
            }
        }
        return null;
    };

    const handleSiguientePasoIngreso = () => {
        const error = validarPasoIngreso(pasoIngreso);
        if (error) {
            setErrorIngresoForm(error);
            return;
        }
        setErrorIngresoForm(null);
        setPasoIngreso(prev => prev + 1);
    };

    const handleAtrasPasoIngreso = () => {
        setErrorIngresoForm(null);
        setPasoIngreso(prev => prev - 1);
    };

    /** Vuelve a la vista de lista tras ver el resultado, sin cerrar el modal de Ingresos. */
    const handleVolverFormularioIngreso = () => {
        setFaseIngreso('form');
        setResultadoIngreso(null);
        setVistaIngreso('lista');
        setPasoIngreso(1);
    };

    /**
     * Elimina todos los gastos variables del mes.
     * Se usa al inicio de un nuevo período/ciclo.
     */
    const handleDeleteAllVariable = async () => {
        try {
            await db.deleteVariableExpenses();
            console.log('✅ Gastos variables eliminados correctamente');
            await fetchStats({ verificarAlertas: true, mostrarSkeleton: false });
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
        setExpenseForm(ESTADO_INICIAL_GASTO);
        setErrorForm(null);
        setPasoGasto(1);
        setFaseGasto('form');
        setResultadoGasto(null);
        setIsModalOpen(true);
    };

    // El paso 3 (Fijo/Variable) no aplica si tarjeta/préstamo ya definieron es_fijo automáticamente
    const aplicaPasoFijoVariable = !expenseForm.esTarjetaCredito && !expenseForm.esPrestamo;
    const totalPasosGasto = aplicaPasoFijoVariable ? 3 : 2;

    /** Valida los campos del paso actual antes de dejar avanzar. Devuelve el mensaje de error o null. */
    const validarPasoGasto = (paso) => {
        if (paso === 1) {
            if (!expenseForm.monto || Number(expenseForm.monto) <= 0) {
                return 'El monto debe ser mayor a cero.';
            }
        }
        if (paso === 2) {
            if (!expenseForm.id_categoria) return 'Seleccioná una categoría.';
            if (!expenseForm.id_metodo_pago) return 'Seleccioná un método de pago.';
            if ((expenseForm.esTarjetaCredito || expenseForm.esPrestamo) && !expenseForm.primeraCuota) {
                return 'Indicá en qué mes vence la primera cuota.';
            }
        }
        return null;
    };

    const handleSiguientePaso = () => {
        const error = validarPasoGasto(pasoGasto);
        if (error) {
            setErrorForm(error);
            return;
        }
        setErrorForm(null);
        setPasoGasto(prev => prev + 1);
    };

    const handleAtrasPaso = () => {
        setErrorForm(null);
        setPasoGasto(prev => prev - 1);
    };

    // Detecta si el método de pago seleccionado acepta cuotas (flag explícito en metodos_pago.acepta_cuotas)
    const handleCambioMetodoPago = (id) => {
        const metodo = paymentMethods.find(pm => pm.id === Number(id) || pm.id === id);
        const esTarjeta = metodo?.acepta_cuotas === true;
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

    // Detecta si la categoría seleccionada es de tipo préstamo (flag explícito en categorias.es_prestamo)
    const handleCambioCategoria = (id) => {
        const cat = categories.find(c => c.id === Number(id) || c.id === id);
        const esPrestamo = cat?.es_prestamo === true;
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
    const gastosRecientes = useMemo(() => stats.gastos.filter(g => !g.es_fijo).slice(0, 5), [stats.gastos]);
    const gastosFijos = useMemo(() => stats.gastos.filter(g => g.es_fijo), [stats.gastos]);

    // Recurrentes activos para el modal de ingresos
    const recurrentesActivos = useMemo(() => recurrentes.filter(r => r.activo), [recurrentes]);

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
            </div>

            <div className="summary-panel">
                <SummaryCard
                    title="Ingresos"
                    amount={stats.ingresoMensual}
                    icon="trending_up"
                    color="success"
                    subtitle="Ingreso registrado"
                    hidden={importesOcultos}
                />
                <SummaryCard
                    title="Saldo Disponible"
                    amount={stats.saldoDisponible}
                    icon="account_balance_wallet"
                    color="primary"
                    dominant
                    subtitle={stats.saldoDisponible >= 0 ? 'Estás en positivo' : 'Superaste el ingreso'}
                    hidden={importesOcultos}
                />
                <SummaryCard
                    title="Gastos Fijos"
                    amount={stats.gastosFijos}
                    icon="lock"
                    color="warning"
                    subtitle="Compromisos del mes"
                    hidden={importesOcultos}
                />
                <SummaryCard
                    title="Gastos Variables"
                    amount={stats.gastosVariables}
                    icon="payments"
                    color="danger"
                    subtitle="Gastos discrecionales"
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

            {/* Modal: Nuevo Gasto (wizard de 3 pasos: monto/descripción → categoría/método/cuotas → fijo/variable) */}
            <Modal
                isOpen={isModalOpen}
                onClose={faseGasto === 'form' ? handleCerrarModalGasto : undefined}
                title={faseGasto === 'form' ? 'Nuevo Gasto' : undefined}
                subtitle={faseGasto === 'form' ? `Paso ${pasoGasto} de ${totalPasosGasto}` : undefined}
                footer={faseGasto === 'form' ? (
                    <div className="form-row">
                        {pasoGasto === 1 ? (
                            <button key="cancelar" type="button" onClick={handleCerrarModalGasto} className="btn btn-secondary" style={{ flex: 1 }}>
                                Cancelar
                            </button>
                        ) : (
                            <button key="atras" type="button" onClick={handleAtrasPaso} disabled={botonesPasoBloqueados} className="btn btn-secondary" style={{ flex: 1 }}>
                                Atrás
                            </button>
                        )}
                        {pasoGasto < totalPasosGasto ? (
                            <button key="siguiente" type="button" onClick={handleSiguientePaso} disabled={botonesPasoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                                Siguiente
                            </button>
                        ) : (
                            <button key="guardar" type="submit" form="form-nuevo-gasto" disabled={botonesPasoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                                Guardar
                            </button>
                        )}
                    </div>
                ) : undefined}
            >
                {faseGasto === 'form' && (
                    <form id="form-nuevo-gasto" onSubmit={handleSubmitExpense} className="form-container">
                        {pasoGasto === 1 && (
                            <>
                            <div className="form-group">
                                <label className="form-label-box">Monto</label>
                                <CurrencyInput
                                    value={expenseForm.monto}
                                    onChange={(val) => setExpenseForm(prev => ({ ...prev, monto: val }))}
                                    className="input currency-input--grande"
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label-box">Descripción (opcional)</label>
                                <input
                                    type="text"
                                    value={expenseForm.descripcion}
                                    onChange={(e) => setExpenseForm(prev => ({ ...prev, descripcion: e.target.value }))}
                                    className="input"
                                />
                            </div>
                            </>
                        )}
                        {pasoGasto === 2 && (
                            <>
                            <div className="form-group">
                                <label className="form-label-box">Categoría</label>
                                <ChipSelector
                                    opciones={categories}
                                    valorSeleccionado={expenseForm.id_categoria ? Number(expenseForm.id_categoria) : null}
                                    onChange={(id) => handleCambioCategoria(id)}
                                    limiteVisible={6}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label-box">Método de Pago</label>
                                <ChipSelector
                                    opciones={paymentMethods}
                                    valorSeleccionado={expenseForm.id_metodo_pago ? Number(expenseForm.id_metodo_pago) : null}
                                    onChange={(id) => handleCambioMetodoPago(id)}
                                    limiteVisible={6}
                                />
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
                                        {OPCIONES_CUOTAS_TARJETA.map(n => (
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
                                        {OPCIONES_CUOTAS_PRESTAMO.map(n => (
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
                            </>
                        )}
                        {pasoGasto === 3 && aplicaPasoFijoVariable && (
                            <div className="form-group">
                                <label className="form-label-box">Tipo de gasto</label>
                                <ChipSelector
                                    opciones={[
                                        { id: 'variable', nombre: 'Variable', icono: 'trending_down' },
                                        { id: 'fijo', nombre: 'Fijo', icono: 'lock' },
                                    ]}
                                    valorSeleccionado={expenseForm.es_fijo ? 'fijo' : 'variable'}
                                    onChange={(id) => setExpenseForm(prev => ({ ...prev, es_fijo: id === 'fijo' }))}
                                    limiteVisible={2}
                                />
                            </div>
                        )}
                        {errorForm && (
                            <p className="edit-form-error" role="alert">{errorForm}</p>
                        )}
                    </form>
                )}
                {faseGasto === 'guardando' && (
                    <div className="result-modal" role="status" aria-live="polite">
                        <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                            progress_activity
                        </span>
                        <h3 className="result-modal__titulo">Guardando gasto...</h3>
                    </div>
                )}
                {faseGasto === 'resultado' && resultadoGasto && (
                    <div className="result-modal">
                        <span
                            className="material-symbols-outlined result-modal__icono"
                            style={{
                                color: resultadoGasto.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                                borderColor: resultadoGasto.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                            }}
                        >
                            {resultadoGasto.tipo === 'error' ? 'cancel' : 'check_circle'}
                        </span>
                        <h3 className="result-modal__titulo">{resultadoGasto.titulo}</h3>
                        {resultadoGasto.mensaje && (
                            <p className="result-modal__subtexto">{resultadoGasto.mensaje}</p>
                        )}
                        <button
                            type="button"
                            className={`btn result-modal__boton result-modal__boton--${resultadoGasto.tipo === 'error' ? 'error' : 'success'}`}
                            onClick={handleCerrarModalGasto}
                        >
                            Continuar
                        </button>
                    </div>
                )}
            </Modal>

            {/* Modal: Ingresos */}
            <Modal
                isOpen={isIncomeModalOpen}
                onClose={faseIngreso === 'form' ? () => { setIsIncomeModalOpen(false); setIncomeEditando(null); } : undefined}
                title={faseIngreso === 'form' ? (vistaIngreso === 'wizard' ? (incomeEditando ? 'Editar ingreso' : 'Nuevo ingreso') : 'Ingresos') : undefined}
                subtitle={faseIngreso === 'form' ? (vistaIngreso === 'wizard' ? `Paso ${pasoIngreso} de 2` : 'Registrá tus ingresos del mes') : undefined}
                footer={faseIngreso === 'form' && vistaIngreso === 'wizard' ? (
                    <div className="form-row">
                        {pasoIngreso === 1 ? (
                            <button key="cancelar" type="button" onClick={() => setVistaIngreso('lista')} className="btn btn-secondary" style={{ flex: 1 }}>
                                Cancelar
                            </button>
                        ) : (
                            <button key="atras" type="button" onClick={handleAtrasPasoIngreso} disabled={botonesPasoIngresoBloqueados} className="btn btn-secondary" style={{ flex: 1 }}>
                                Atrás
                            </button>
                        )}
                        {pasoIngreso < 2 ? (
                            <button key="siguiente" type="button" onClick={handleSiguientePasoIngreso} disabled={botonesPasoIngresoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                                Siguiente
                            </button>
                        ) : (
                            <button key="guardar" type="submit" form="form-ingreso-wizard" disabled={botonesPasoIngresoBloqueados} className="btn btn-primary" style={{ flex: 1 }}>
                                {incomeEditando ? 'Actualizar' : 'Agregar ingreso'}
                            </button>
                        )}
                    </div>
                ) : undefined}
                disableClose={!!incomeConfirmDelete}
            >
                {faseIngreso === 'form' && vistaIngreso === 'lista' && (
                    <div className="form-container">
                        <button type="button" onClick={handleAbrirWizardIngreso} className="btn btn-primary" style={{ width: '100%', marginBottom: '20px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px', verticalAlign: 'middle' }}>add</span>
                            Nuevo ingreso
                        </button>

                        {/* Lista de ingresos del mes */}
                        {ingresosMes.length > 0 && (
                            <div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Ingresos de este mes
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {ingresosMes.map(ing => (
                                        <div key={ing.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
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
                            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '12px' }}>
                                Todavía no registraste ingresos este mes.
                            </div>
                        )}

                        {/* Lista de recurrentes activos — informativo */}
                        {recurrentesActivos.length > 0 && (
                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Recurrentes configurados
                                </div>
                                {recurrentesActivos.map(rec => (
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
                )}
                {faseIngreso === 'form' && vistaIngreso === 'wizard' && (
                    <form id="form-ingreso-wizard" onSubmit={handleSaveIncome} className="form-container">
                        {pasoIngreso === 1 && (
                            <>
                            <div className="form-group">
                                <label className="form-label-box">Monto</label>
                                <CurrencyInput
                                    key={`income-${incomeEditando ?? 'new'}`}
                                    value={incomeForm.monto}
                                    onChange={(val) => setIncomeForm(prev => ({ ...prev, monto: val }))}
                                    className="input currency-input--grande"
                                    autoFocus
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
                            </>
                        )}
                        {pasoIngreso === 2 && (
                            <>
                            <div className="form-group">
                                <label className="form-label-box">Categoría (opcional)</label>
                                <ChipSelector
                                    opciones={[
                                        { id: '', nombre: 'Sin categoría', icono: 'block' },
                                        ...categoriaIngresos,
                                    ]}
                                    valorSeleccionado={incomeForm.categoria_id ? Number(incomeForm.categoria_id) : ''}
                                    onChange={(id) => setIncomeForm(prev => ({ ...prev, categoria_id: id === '' ? '' : id }))}
                                    limiteVisible={6}
                                />
                            </div>
                            {/* Solo mostrar selector recurrente al crear, no al editar */}
                            {!incomeEditando && (
                                <div className="form-group">
                                    <label className="form-label-box">Tipo de ingreso</label>
                                    <ChipSelector
                                        opciones={[
                                            { id: 'puntual', nombre: 'Puntual', icono: 'event' },
                                            { id: 'recurrente', nombre: 'Recurrente', icono: 'repeat' },
                                        ]}
                                        valorSeleccionado={incomeForm.es_recurrente ? 'recurrente' : 'puntual'}
                                        onChange={(id) => setIncomeForm(prev => ({ ...prev, es_recurrente: id === 'recurrente' }))}
                                        limiteVisible={2}
                                    />
                                </div>
                            )}
                            </>
                        )}
                        {errorIngresoForm && (
                            <p className="edit-form-error" role="alert">{errorIngresoForm}</p>
                        )}
                    </form>
                )}
                {faseIngreso === 'guardando' && (
                    <div className="result-modal" role="status" aria-live="polite">
                        <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                            progress_activity
                        </span>
                        <h3 className="result-modal__titulo">Guardando...</h3>
                    </div>
                )}
                {faseIngreso === 'resultado' && resultadoIngreso && (
                    <div className="result-modal">
                        <span
                            className="material-symbols-outlined result-modal__icono"
                            style={{
                                color: resultadoIngreso.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                                borderColor: resultadoIngreso.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                            }}
                        >
                            {resultadoIngreso.tipo === 'error' ? 'cancel' : 'check_circle'}
                        </span>
                        <h3 className="result-modal__titulo">{resultadoIngreso.titulo}</h3>
                        {resultadoIngreso.mensaje && (
                            <p className="result-modal__subtexto">{resultadoIngreso.mensaje}</p>
                        )}
                        <button
                            type="button"
                            className={`btn result-modal__boton result-modal__boton--${resultadoIngreso.tipo === 'error' ? 'error' : 'success'}`}
                            onClick={handleVolverFormularioIngreso}
                        >
                            Continuar
                        </button>
                    </div>
                )}
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
