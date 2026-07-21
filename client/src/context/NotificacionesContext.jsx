import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
    getNotificaciones,
    createNotificacion,
    marcarLeida,
    marcarTodasLeidas,
    actualizarEstadoEmail,
    getConfigNotificaciones,
    saveConfigNotificaciones,
    getStatsByMonth,
} from '../lib/db';
import { useAuth } from './AuthContext';
import { fechaHoyArgentina } from '../utils/format';
import {
    evaluarAlertasFinancieras,
    evaluarAlertaGastoAlto,
    evaluarAlertasGastosFijos,
    evaluarAlertaConcentracionCategoria,
    calcularProyecciones,
    generarResumenDiario as generarResumenDiarioPuro,
    generarResumenSemanal as generarResumenSemanalPuro,
    generarResumenMensual as generarResumenMensualPuro,
} from '../lib/alertas';

// Clave de localStorage para el throttle de alertas financieras (evita spam).
// Nota: el throttle es por dispositivo/navegador. En modo incógnito o desde otro dispositivo
// las alertas pueden repetirse el mismo día — comportamiento aceptado para app personal.
const THROTTLE_KEY = 'notif_alertas_throttle';

const NotificacionesContext = createContext({});

// URL base del backend para el endpoint de email — obligatoria en producción
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

// Configuración de notificaciones por defecto si el usuario no tiene una guardada
const CONFIG_DEFAULT = {
    email_habilitado:                   false,
    email_saldo_bajo:                   false,
    email_gasto_alto:                   false,
    email_resumen_diario:               false,
    email_resumen_semanal:              false,
    email_resumen_mensual:              false,
    email_notificaciones_n8n:           true,
    notificar_saldo_bajo:               true,
    umbral_saldo_bajo:                  5000,
    notificar_porcentaje_ingreso:       true,
    porcentaje_maximo_ingreso:          80,
    notificar_gasto_alto:               true,
    monto_gasto_alto:                   10000,
    // Fase 4
    notificar_gastos_fijos_pendientes:  true,
    notificar_gastos_fijos_exceso:      true,
    umbral_fijos_ingreso:               60,
    notificar_variables_crecimiento:    true,
    margen_crecimiento_variables:       20,
    notificar_concentracion_categoria:  true,
    porcentaje_concentracion_categoria: 40,
    email_alertas_gastos_fijos:         false,
    // Fase 5
    notificar_proyecciones:             true,
    objetivo_ahorro_porcentaje:         10,
};

export const NotificacionesProvider = ({ children }) => {
    const { user, session } = useAuth();

    const [notificaciones, setNotificaciones]   = useState([]);
    const [config, setConfig]                   = useState(CONFIG_DEFAULT);
    const [cargando, setCargando]               = useState(false);
    const [panelAbierto, setPanelAbierto]       = useState(false);

    // Caché del mes anterior para evitar queries repetidas en cada fetchStats
    const cacheMesAnterior = useRef({ key: null, data: null });

    const noLeidas = useMemo(() => notificaciones.filter(n => !n.leida).length, [notificaciones]);

    /**
     * Carga las notificaciones y la configuración del usuario desde Supabase.
     */
    const cargarNotificaciones = useCallback(async () => {
        if (!user) return;
        try {
            setCargando(true);
            const [notifs, cfg] = await Promise.all([
                getNotificaciones(),
                getConfigNotificaciones(),
            ]);
            setNotificaciones(notifs);
            if (cfg) setConfig(cfg);
        } catch (err) {
            console.error('❌ Error al cargar notificaciones:', err.message);
        } finally {
            setCargando(false);
        }
    }, [user]);

    // Cargar al montar y cuando cambia el usuario
    useEffect(() => {
        if (user) cargarNotificaciones();
        else {
            setNotificaciones([]);
            setConfig(CONFIG_DEFAULT);
        }
    }, [user, cargarNotificaciones]);

    // Refrescar notificaciones cuando el usuario vuelve a la pestaña.
    // Usamos ref para acceder siempre a la versión más reciente de cargarNotificaciones
    // sin re-registrar el listener cada vez que la función se recrea.
    const cargarNotificacionesRef = useRef(cargarNotificaciones);
    useEffect(() => { cargarNotificacionesRef.current = cargarNotificaciones; }, [cargarNotificaciones]);

    useEffect(() => {
        if (!user) return;
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                cargarNotificacionesRef.current();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [user]);

    /**
     * Envía el email de la notificación al backend.
     * Si falla, actualiza el campo email_error en Supabase.
     * Nunca interrumpe el flujo principal.
     * Definida antes de agregarNotificacion para evitar TDZ en el dep array.
     */
    const enviarEmailSiCorresponde = useCallback(async (notificacion) => {
        if (!config?.email_habilitado || !user?.email) return;

        try {
            const res = await fetch(`${BACKEND_URL}/api/notifications/email`, {
                method:  'POST',
                body:    JSON.stringify({
                    notificacion,
                }),
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                },
            });

            const resultado = await res.json();

            // Actualizar estado de email en Supabase en segundo plano
            actualizarEstadoEmail(
                notificacion.id,
                resultado.emailEnviado,
                resultado.emailError || null
            ).catch(e => console.warn('No se pudo actualizar estado email:', e.message));

            // Refrescar la notificación en el estado local con el estado actualizado
            if (resultado.emailEnviado) {
                setNotificaciones(prev =>
                    prev.map(n =>
                        n.id === notificacion.id ? { ...n, email_enviado: true } : n
                    )
                );
            }
        } catch (err) {
            // Error de red — registrar pero no interrumpir
            console.warn('⚠️ No se pudo contactar al backend para envío de email:', err.message);
        }
    }, [session, config, user]);

    /**
     * Crea una nueva notificación en Supabase y, opcionalmente, envía el email.
     * Si falla el email, la notificación queda creada igualmente.
     *
     * @param {Object} datos - { titulo, mensaje, tipo, origen, metadata }
     */
    const agregarNotificacion = useCallback(async (datos) => {
        if (!user) return;
        try {
            // 1. Persistir en Supabase
            const nueva = await createNotificacion(datos);

            // 2. Actualizar estado local inmediatamente para feedback visual
            setNotificaciones(prev => [nueva, ...prev]);

            // 3. Intentar enviar email si el usuario lo tiene configurado (fire-and-forget)
            enviarEmailSiCorresponde(nueva);

            return nueva;
        } catch (err) {
            console.error('❌ Error al crear notificación:', err.message);
        }
    }, [user, enviarEmailSiCorresponde]);

    /**
     * Marca una notificación como leída en Supabase y actualiza el estado local.
     */
    const leerNotificacion = useCallback(async (id) => {
        try {
            await marcarLeida(id);
            setNotificaciones(prev =>
                prev.map(n => n.id === id ? { ...n, leida: true } : n)
            );
        } catch (err) {
            console.error('❌ Error al marcar notificación como leída:', err.message);
        }
    }, []);

    /**
     * Marca todas las notificaciones como leídas.
     */
    const leerTodas = useCallback(async () => {
        try {
            await marcarTodasLeidas();
            setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
        } catch (err) {
            console.error('❌ Error al marcar todas como leídas:', err.message);
        }
    }, []);

    const togglePanel = useCallback(() => setPanelAbierto(prev => !prev), []);
    const cerrarPanel = useCallback(() => setPanelAbierto(false), []);

    /**
     * Guarda la configuración de notificaciones en Supabase y actualiza el estado local.
     * Se usa desde la página de Configuración.
     *
     * @param {Object} nuevaConfig - Campos a actualizar
     */
    const guardarConfig = useCallback(async (nuevaConfig) => {
        try {
            const guardada = await saveConfigNotificaciones(nuevaConfig);
            setConfig(guardada);
            return guardada;
        } catch (err) {
            console.error('❌ Error al guardar configuración de notificaciones:', err.message);
            throw err;
        }
    }, []);

    /**
     * Verifica si una alerta de un tipo dado puede dispararse hoy.
     * Usa localStorage para evitar repetir la misma alerta en el mismo día.
     * Retorna true si la alerta no fue disparada hoy, false si ya lo fue.
     *
     * @param {string} tipoAlerta - Identificador único de la alerta (ej: 'saldo_bajo')
     * @returns {boolean}
     */
    const puedeDispararAlerta = useCallback((tipoAlerta) => {
        try {
            const hoy = fechaHoyArgentina();
            const raw = localStorage.getItem(THROTTLE_KEY);
            let throttle = {};
            try {
                const parsed = JSON.parse(raw || '{}');
                // Validar que sea un objeto plano — previene prototype pollution
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.getPrototypeOf(parsed) === Object.prototype) {
                    throttle = parsed;
                }
            } catch {
                // Mantener throttle vacío si el JSON está corrupto
            }
            if (throttle[tipoAlerta] === hoy) return false;
            throttle[tipoAlerta] = hoy;
            localStorage.setItem(THROTTLE_KEY, JSON.stringify(throttle));
            return true;
        } catch {
            return true;
        }
    }, []);

    /**
     * Analiza las estadísticas financieras y dispara alertas según la configuración.
     * Se llama después de cada fetchStats() en el Dashboard.
     *
     * Reglas de Fase 2:
     * 1. Saldo disponible por debajo del umbral configurado
     * 2. Porcentaje del ingreso superado
     * 3. Ingreso mensual no configurado (= 0)
     *
     * Cada alerta se dispara como máximo una vez por día (throttle en localStorage).
     *
     * @param {Object} stats - Resultado de getStats()
     */
    const verificarAlertasFinancieras = useCallback(async (stats) => {
        if (!user || !stats) return;
        const notificaciones = evaluarAlertasFinancieras(stats, config, puedeDispararAlerta);
        for (const notif of notificaciones) {
            await agregarNotificacion(notif);
        }
    }, [user, config, agregarNotificacion, puedeDispararAlerta]);

    /**
     * Verifica si un gasto individual supera el monto alto configurado.
     * Se llama inmediatamente después de crear un gasto.
     *
     * @param {Object} gasto - { descripcion, monto }
     */
    const verificarAlertaGastoAlto = useCallback(async (gasto) => {
        if (!user) return;
        const notificaciones = evaluarAlertaGastoAlto(gasto, config);
        for (const notif of notificaciones) {
            await agregarNotificacion(notif);
        }
    }, [user, config, agregarNotificacion]);

    // ================================================================
    // FASE 4 — Alertas de gastos fijos, variables y categorías
    // ================================================================

    /**
     * Verifica alertas relacionadas con gastos fijos y variables del mes.
     * Compara el mes actual contra el mes anterior para detectar pendientes y crecimientos.
     * Se llama desde Dashboard al cargar estadísticas.
     *
     * @param {Object} stats - Resultado de getStats() del mes actual
     */
    const verificarAlertasGastosFijos = useCallback(async (stats) => {
        if (!user || !stats || stats.ingresoMensual === 0) return;

        const ahora = new Date();
        const mesActual = ahora.getMonth() + 1;
        const anioActual = ahora.getFullYear();

        // Calcular mes anterior (con manejo de cambio de año)
        const mesAnterior = mesActual === 1 ? 12 : mesActual - 1;
        const anioAnterior = mesActual === 1 ? anioActual - 1 : anioActual;

        let statsMesAnterior = null;
        try {
            const cacheKey = `${anioAnterior}-${mesAnterior}`;
            if (cacheMesAnterior.current.key === cacheKey) {
                statsMesAnterior = cacheMesAnterior.current.data;
            } else {
                statsMesAnterior = await getStatsByMonth(anioAnterior, mesAnterior);
                cacheMesAnterior.current = { key: cacheKey, data: statsMesAnterior };
            }
        } catch {
            // Si falla la consulta del mes anterior, no bloqueamos las alertas locales
        }

        const notificaciones = evaluarAlertasGastosFijos(stats, statsMesAnterior, config, puedeDispararAlerta);
        for (const notif of notificaciones) {
            await agregarNotificacion(notif);
        }
    }, [user, config, agregarNotificacion, puedeDispararAlerta]);

    /**
     * Detecta si alguna categoría concentra demasiado del gasto total del mes.
     * Se llama desde Dashboard al cargar estadísticas.
     *
     * @param {Object} stats - Resultado de getStats()
     */
    const verificarAlertaConcentracionCategoria = useCallback(async (stats) => {
        if (!user || !stats) return;
        const notificaciones = evaluarAlertaConcentracionCategoria(stats, config, puedeDispararAlerta);
        for (const notif of notificaciones) {
            await agregarNotificacion(notif);
        }
    }, [user, config, agregarNotificacion, puedeDispararAlerta]);

    // ================================================================
    // FASE 5 — Proyecciones y resúmenes
    // ================================================================

    /**
     * Calcula y dispara alertas de proyección financiera para el mes en curso.
     * - Gasto diario disponible hasta fin de mes
     * - Ahorro estimado en riesgo
     * - Saldo proyectado negativo a fin de mes
     *
     * @param {Object} stats - Resultado de getStats()
     */
    const verificarProyecciones = useCallback(async (stats) => {
        if (!user || !stats) return;

        const { notificaciones, datos } = calcularProyecciones(stats, config, puedeDispararAlerta);
        for (const notif of notificaciones) {
            await agregarNotificacion(notif);
        }

        // Retorno preservado por compatibilidad con el contrato original (gastoDiarioDisponible,
        // gastoProyectado, diasRestantes) — hoy el Dashboard no lo usa (llama esta función en
        // fire-and-forget y recalcula gastoDiarioDisponible con su propio useMemo), pero un
        // futuro consumidor podría depender de él sin tener que tocar esta función.
        return datos ?? undefined;
    }, [user, config, agregarNotificacion, puedeDispararAlerta]);

    /**
     * Genera el resumen diario de gastos del día de hoy.
     * Se llama manualmente o desde un botón en el Dashboard.
     * Solo dispara si el usuario tiene notificaciones habilitadas.
     *
     * @param {Object} stats - Resultado de getStats() actual
     */
    const generarResumenDiario = useCallback(async (stats) => {
        if (!user || !stats) return;
        const notif = generarResumenDiarioPuro(stats);
        if (notif) await agregarNotificacion(notif);
    }, [user, agregarNotificacion]);

    /**
     * Genera el resumen semanal de gastos agrupado por categoría.
     * Toma los últimos 7 días desde hoy.
     *
     * @param {Object} stats - Resultado de getStats()
     */
    const generarResumenSemanal = useCallback(async (stats) => {
        if (!user || !stats) return;
        const notif = generarResumenSemanalPuro(stats);
        if (notif) await agregarNotificacion(notif);
    }, [user, agregarNotificacion]);

    /**
     * Genera el resumen mensual del mes en curso.
     * Muestra totales, fijos vs variables, y top categorías.
     *
     * @param {Object} stats - Resultado de getStats()
     */
    const generarResumenMensual = useCallback(async (stats) => {
        if (!user || !stats) return;
        const notif = generarResumenMensualPuro(stats);
        if (notif) await agregarNotificacion(notif);
    }, [user, agregarNotificacion]);

    // Memoizar el value para que los subscribers solo se re-rendericen
    // cuando cambia algo que realmente les importa, no en cada render del provider.
    const contextValue = useMemo(() => ({
        notificaciones,
        noLeidas,
        config,
        setConfig,
        cargando,
        panelAbierto,
        togglePanel,
        cerrarPanel,
        agregarNotificacion,
        leerNotificacion,
        leerTodas,
        cargarNotificaciones,
        guardarConfig,
        verificarAlertasFinancieras,
        verificarAlertaGastoAlto,
        verificarAlertasGastosFijos,
        verificarAlertaConcentracionCategoria,
        verificarProyecciones,
        generarResumenDiario,
        generarResumenSemanal,
        generarResumenMensual,
    }), [
        notificaciones, noLeidas, config, cargando, panelAbierto,
        togglePanel, cerrarPanel, agregarNotificacion, leerNotificacion,
        leerTodas, cargarNotificaciones, guardarConfig,
        verificarAlertasFinancieras, verificarAlertaGastoAlto,
        verificarAlertasGastosFijos, verificarAlertaConcentracionCategoria,
        verificarProyecciones, generarResumenDiario, generarResumenSemanal,
        generarResumenMensual,
    ]);

    return (
        <NotificacionesContext.Provider value={contextValue}>
            {children}
        </NotificacionesContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useNotificaciones = () => useContext(NotificacionesContext);
