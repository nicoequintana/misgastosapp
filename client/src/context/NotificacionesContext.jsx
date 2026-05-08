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
            const hoy = new Date().toISOString().split('T')[0];
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

        const { saldoDisponible, ingresoMensual, totalGastos } = stats;

        // Alerta: ingreso mensual no configurado
        if (ingresoMensual === 0 && puedeDispararAlerta('ingreso_no_configurado')) {
            await agregarNotificacion({
                titulo:  'Ingreso mensual no configurado',
                mensaje: 'No registraste tu ingreso mensual. Configuralo para ver tu saldo disponible correctamente.',
                tipo:    'warning',
                origen:  'sistema',
            });
            return; // Si no hay ingreso, las otras alertas no tienen sentido
        }

        // Alerta: saldo disponible por debajo del umbral
        if (
            config.notificar_saldo_bajo &&
            ingresoMensual > 0 &&
            saldoDisponible < config.umbral_saldo_bajo &&
            puedeDispararAlerta('saldo_bajo')
        ) {
            await agregarNotificacion({
                titulo:  'Saldo disponible bajo',
                mensaje: `Tu saldo disponible es $${saldoDisponible.toLocaleString('es-AR')}, por debajo del umbral de $${Number(config.umbral_saldo_bajo).toLocaleString('es-AR')}.`,
                tipo:    'error',
                origen:  'alertas_financieras',
                metadata: {
                    saldo_disponible:  saldoDisponible,
                    umbral_configurado: config.umbral_saldo_bajo,
                },
            });
        }

        // Alerta: porcentaje del ingreso superado
        if (
            config.notificar_porcentaje_ingreso &&
            ingresoMensual > 0 &&
            puedeDispararAlerta('porcentaje_ingreso')
        ) {
            const porcentajeUsado = (totalGastos / ingresoMensual) * 100;
            if (porcentajeUsado >= config.porcentaje_maximo_ingreso) {
                await agregarNotificacion({
                    titulo:  'Límite de gastos alcanzado',
                    mensaje: `Usaste el ${porcentajeUsado.toFixed(1)}% de tu ingreso mensual (límite: ${config.porcentaje_maximo_ingreso}%).`,
                    tipo:    'warning',
                    origen:  'alertas_financieras',
                    metadata: {
                        porcentaje_usado:   Math.round(porcentajeUsado),
                        porcentaje_maximo:  config.porcentaje_maximo_ingreso,
                        ingreso_mensual:    ingresoMensual,
                        total_gastos:       totalGastos,
                    },
                });
            }
        }
    }, [user, config, agregarNotificacion, puedeDispararAlerta]);

    /**
     * Verifica si un gasto individual supera el monto alto configurado.
     * Se llama inmediatamente después de crear un gasto.
     *
     * @param {Object} gasto - { descripcion, monto }
     */
    const verificarAlertaGastoAlto = useCallback(async (gasto) => {
        if (!user || !config.notificar_gasto_alto) return;
        if (Number(gasto.monto) >= Number(config.monto_gasto_alto)) {
            await agregarNotificacion({
                titulo:  'Gasto alto detectado',
                mensaje: `El gasto "${gasto.descripcion}" por $${Number(gasto.monto).toLocaleString('es-AR')} supera el umbral de $${Number(config.monto_gasto_alto).toLocaleString('es-AR')}.`,
                tipo:    'warning',
                origen:  'alertas_financieras',
                metadata: {
                    descripcion:        gasto.descripcion,
                    monto:              gasto.monto,
                    umbral_configurado: config.monto_gasto_alto,
                },
            });
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

        // Alerta: gastos fijos superan % del ingreso
        if (
            config.notificar_gastos_fijos_exceso &&
            puedeDispararAlerta('gastos_fijos_exceso')
        ) {
            const porcentajeFijos = (stats.gastosFijos / stats.ingresoMensual) * 100;
            if (porcentajeFijos >= Number(config.umbral_fijos_ingreso)) {
                await agregarNotificacion({
                    titulo:  'Gastos fijos elevados',
                    mensaje: `Tus gastos fijos representan el ${porcentajeFijos.toFixed(1)}% de tu ingreso mensual (límite configurado: ${config.umbral_fijos_ingreso}%).`,
                    tipo:    'warning',
                    origen:  'alertas_financieras',
                    metadata: {
                        porcentaje_fijos:  Math.round(porcentajeFijos),
                        umbral_configurado: config.umbral_fijos_ingreso,
                        gastos_fijos:      stats.gastosFijos,
                        ingreso_mensual:   stats.ingresoMensual,
                    },
                });
            }
        }

        // Alerta: gastos fijos del mes anterior no registrados este mes
        if (
            config.notificar_gastos_fijos_pendientes &&
            statsMesAnterior &&
            puedeDispararAlerta('gastos_fijos_pendientes')
        ) {
            const fijosAnterior = statsMesAnterior.gastosFijosLista.length;
            const fijosActual = (stats.gastos || []).filter(g => g.es_fijo).length;

            if (fijosAnterior > 0 && fijosActual < fijosAnterior) {
                const faltantes = fijosAnterior - fijosActual;
                await agregarNotificacion({
                    titulo:  'Gastos fijos pendientes',
                    mensaje: `El mes anterior registraste ${fijosAnterior} gastos fijos y este mes solo llevás ${fijosActual}. Puede que te falten ${faltantes} por registrar.`,
                    tipo:    'info',
                    origen:  'alertas_financieras',
                    metadata: {
                        fijos_mes_anterior: fijosAnterior,
                        fijos_mes_actual:   fijosActual,
                        faltantes,
                    },
                });
            }
        }

        // Alerta: gastos variables crecen más de lo habitual
        if (
            config.notificar_variables_crecimiento &&
            statsMesAnterior &&
            statsMesAnterior.gastosVariables > 0 &&
            puedeDispararAlerta('variables_crecimiento')
        ) {
            const margen = Number(config.margen_crecimiento_variables) / 100;
            const umbralVariables = statsMesAnterior.gastosVariables * (1 + margen);
            if (stats.gastosVariables > umbralVariables) {
                const crecimiento = ((stats.gastosVariables / statsMesAnterior.gastosVariables) - 1) * 100;
                await agregarNotificacion({
                    titulo:  'Gastos variables en aumento',
                    mensaje: `Tus gastos variables subieron un ${crecimiento.toFixed(1)}% respecto al mes anterior (límite configurado: ${config.margen_crecimiento_variables}%).`,
                    tipo:    'warning',
                    origen:  'alertas_financieras',
                    metadata: {
                        variables_actual:   stats.gastosVariables,
                        variables_anterior: statsMesAnterior.gastosVariables,
                        crecimiento_pct:    Math.round(crecimiento),
                        margen_configurado: config.margen_crecimiento_variables,
                    },
                });
            }
        }
    }, [user, config, agregarNotificacion, puedeDispararAlerta]);

    /**
     * Detecta si alguna categoría concentra demasiado del gasto total del mes.
     * Se llama desde Dashboard al cargar estadísticas.
     *
     * @param {Object} stats - Resultado de getStats()
     */
    const verificarAlertaConcentracionCategoria = useCallback(async (stats) => {
        if (!user || !stats || stats.totalGastos === 0) return;
        if (!config.notificar_concentracion_categoria) return;
        if (!puedeDispararAlerta('concentracion_categoria')) return;

        const umbral = Number(config.porcentaje_concentracion_categoria);

        // Buscar la categoría con mayor porcentaje
        const entrada = Object.entries(stats.porCategoria || {})
            .map(([nombre, datos]) => ({
                nombre,
                porcentaje: (datos.total / stats.totalGastos) * 100,
                total: datos.total,
            }))
            .find(c => c.porcentaje >= umbral);

        if (entrada) {
            await agregarNotificacion({
                titulo:  'Concentración de gasto en una categoría',
                mensaje: `La categoría "${entrada.nombre}" concentra el ${entrada.porcentaje.toFixed(1)}% de tu gasto total del mes ($${entrada.total.toLocaleString('es-AR')}).`,
                tipo:    'info',
                origen:  'alertas_financieras',
                metadata: {
                    categoria:          entrada.nombre,
                    porcentaje:         Math.round(entrada.porcentaje),
                    total_categoria:    entrada.total,
                    umbral_configurado: umbral,
                },
            });
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
        if (!user || !stats || stats.ingresoMensual === 0) return;
        if (!config.notificar_proyecciones) return;

        const ahora = new Date();
        const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
        const diaActual = ahora.getDate();
        const diasRestantes = diasEnMes - diaActual;

        if (diasRestantes <= 0) return;

        const { ingresoMensual, totalGastos, saldoDisponible } = stats;

        // Gasto diario promedio hasta hoy
        const gastoDiarioPromedio = totalGastos / diaActual;
        // Proyección de gasto total a fin de mes
        const gastoProyectado = gastoDiarioPromedio * diasEnMes;
        // Cuánto puede gastar por día para no quedarse en rojo
        const gastoDiarioDisponible = saldoDisponible / diasRestantes;

        // Alerta: saldo proyectado a fin de mes queda negativo
        if (
            gastoProyectado > ingresoMensual &&
            puedeDispararAlerta('proyeccion_saldo_negativo')
        ) {
            const deficit = gastoProyectado - ingresoMensual;
            await agregarNotificacion({
                titulo:  'Proyección de saldo negativo',
                mensaje: `Al ritmo actual de gastos, terminarías el mes con un déficit de $${deficit.toLocaleString('es-AR', { maximumFractionDigits: 0 })}.`,
                tipo:    'error',
                origen:  'proyeccion',
                metadata: {
                    gasto_proyectado:     Math.round(gastoProyectado),
                    ingreso_mensual:      ingresoMensual,
                    deficit_proyectado:   Math.round(deficit),
                    dias_restantes:       diasRestantes,
                },
            });
        }

        // Alerta: ahorro estimado en riesgo
        const objetivoAhorro = ingresoMensual * (Number(config.objetivo_ahorro_porcentaje) / 100);
        const ahorroProyectado = ingresoMensual - gastoProyectado;
        if (
            objetivoAhorro > 0 &&
            ahorroProyectado < objetivoAhorro &&
            puedeDispararAlerta('ahorro_en_riesgo')
        ) {
            await agregarNotificacion({
                titulo:  'Objetivo de ahorro en riesgo',
                mensaje: `Al ritmo actual no alcanzarías tu objetivo de ahorro del ${config.objetivo_ahorro_porcentaje}% ($${objetivoAhorro.toLocaleString('es-AR', { maximumFractionDigits: 0 })}). Ahorro proyectado: $${Math.max(0, ahorroProyectado).toLocaleString('es-AR', { maximumFractionDigits: 0 })}.`,
                tipo:    'warning',
                origen:  'proyeccion',
                metadata: {
                    objetivo_ahorro:    Math.round(objetivoAhorro),
                    ahorro_proyectado:  Math.round(Math.max(0, ahorroProyectado)),
                    objetivo_pct:       config.objetivo_ahorro_porcentaje,
                },
            });
        }

        // Proyección informativa: gasto diario disponible (sin throttle — es dato, no alerta)
        return {
            gastoDiarioDisponible: Math.max(0, gastoDiarioDisponible),
            gastoProyectado,
            diasRestantes,
        };
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

        const hoy = new Date().toISOString().split('T')[0];
        const gastosHoy = (stats.gastos || []).filter(g => {
            const fechaGasto = (g.fecha || '').split('T')[0];
            return fechaGasto === hoy;
        });

        const totalHoy = gastosHoy.reduce((s, g) => s + parseFloat(g.monto || 0), 0);

        await agregarNotificacion({
            titulo:  'Resumen diario de gastos',
            mensaje: gastosHoy.length > 0
                ? `Hoy registraste ${gastosHoy.length} gasto${gastosHoy.length > 1 ? 's' : ''} por un total de $${totalHoy.toLocaleString('es-AR')}.`
                : 'No registraste gastos hoy.',
            tipo:    'info',
            origen:  'resumen',
            metadata: {
                fecha:         hoy,
                cantidad:      gastosHoy.length,
                total_del_dia: Math.round(totalHoy),
            },
        });
    }, [user, agregarNotificacion]);

    /**
     * Genera el resumen semanal de gastos agrupado por categoría.
     * Toma los últimos 7 días desde hoy.
     *
     * @param {Object} stats - Resultado de getStats()
     */
    const generarResumenSemanal = useCallback(async (stats) => {
        if (!user || !stats) return;

        const hoy = new Date();
        const hace7Dias = new Date(hoy);
        hace7Dias.setDate(hoy.getDate() - 6);
        const desde = hace7Dias.toISOString().split('T')[0];
        const hasta = hoy.toISOString().split('T')[0];

        const gastosSemana = (stats.gastos || []).filter(g => {
            const fecha = (g.fecha || '').split('T')[0];
            return fecha >= desde && fecha <= hasta;
        });

        const totalSemana = gastosSemana.reduce((s, g) => s + parseFloat(g.monto || 0), 0);

        // Top 3 categorías de la semana
        const porCat = gastosSemana.reduce((acc, g) => {
            const nombre = g.categorias?.nombre || 'Sin categoría';
            acc[nombre] = (acc[nombre] || 0) + parseFloat(g.monto || 0);
            return acc;
        }, {});
        const top3 = Object.entries(porCat)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([nombre, total]) => `${nombre}: $${total.toLocaleString('es-AR')}`)
            .join(' · ');

        await agregarNotificacion({
            titulo:  'Resumen semanal de gastos',
            mensaje: gastosSemana.length > 0
                ? `En los últimos 7 días gastaste $${totalSemana.toLocaleString('es-AR')} en ${gastosSemana.length} movimientos.${top3 ? ` Top categorías: ${top3}.` : ''}`
                : 'No registraste gastos en los últimos 7 días.',
            tipo:    'info',
            origen:  'resumen',
            metadata: {
                desde,
                hasta,
                cantidad:      gastosSemana.length,
                total_semana:  Math.round(totalSemana),
                top_categorias: top3 || null,
            },
        });
    }, [user, agregarNotificacion]);

    /**
     * Genera el resumen mensual del mes en curso.
     * Muestra totales, fijos vs variables, y top categorías.
     *
     * @param {Object} stats - Resultado de getStats()
     */
    const generarResumenMensual = useCallback(async (stats) => {
        if (!user || !stats) return;

        const ahora = new Date();
        const mes = ahora.toLocaleString('es-AR', { month: 'long' });

        const top3 = Object.entries(stats.porCategoria || {})
            .sort(([, a], [, b]) => b.total - a.total)
            .slice(0, 3)
            .map(([nombre, datos]) => `${nombre}: $${datos.total.toLocaleString('es-AR')}`)
            .join(' · ');

        const pctFijos = stats.ingresoMensual > 0
            ? ((stats.gastosFijos / stats.ingresoMensual) * 100).toFixed(1)
            : '—';

        await agregarNotificacion({
            titulo:  `Resumen del mes — ${mes.charAt(0).toUpperCase() + mes.slice(1)}`,
            mensaje: `Total gastado: $${stats.totalGastos.toLocaleString('es-AR')} (fijos: $${stats.gastosFijos.toLocaleString('es-AR')} · variables: $${stats.gastosVariables.toLocaleString('es-AR')}). Saldo disponible: $${stats.saldoDisponible.toLocaleString('es-AR')}.${top3 ? ` Top categorías: ${top3}.` : ''}`,
            tipo:    'info',
            origen:  'resumen',
            metadata: {
                mes,
                total_gastos:     Math.round(stats.totalGastos),
                gastos_fijos:     Math.round(stats.gastosFijos),
                gastos_variables: Math.round(stats.gastosVariables),
                saldo_disponible: Math.round(stats.saldoDisponible),
                ingreso_mensual:  stats.ingresoMensual,
                pct_fijos:        pctFijos,
                top_categorias:   top3 || null,
            },
        });
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
