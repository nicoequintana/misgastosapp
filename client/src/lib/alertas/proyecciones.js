/**
 * Calcula proyecciones financieras para el mes en curso y arma las alertas a disparar.
 * Función pura: no hace I/O.
 *
 * Además de las notificaciones, retorna los datos de proyección (`datos`) que el
 * Dashboard consume directamente — gastoDiarioDisponible, gastoProyectado, diasRestantes.
 * Ese cálculo sigue siempre, independiente de si las alertas están habilitadas
 * (`config.notificar_proyecciones`), porque el dashboard lo necesita como dato aunque
 * las alertas estén apagadas.
 *
 * @param {Object} stats - Resultado de getStats()
 * @param {Object} config - Configuración de notificaciones del usuario
 * @param {(tipoAlerta: string) => boolean} puedeDisparar - Chequea/marca el throttle diario
 * @returns {{
 *   notificaciones: Array<{ titulo: string, mensaje: string, tipo: string, origen: string, metadata: Object }>,
 *   datos: { gastoDiarioDisponible: number, gastoProyectado: number, diasRestantes: number } | null
 * }}
 */
export const calcularProyecciones = (stats, config, puedeDisparar) => {
    if (!stats || stats.ingresoMensual === 0) return { notificaciones: [], datos: null };

    const ahora = new Date();
    const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
    const diaActual = ahora.getDate();
    const diasRestantes = diasEnMes - diaActual;

    if (diasRestantes <= 0) return { notificaciones: [], datos: null };

    const { ingresoMensual, totalGastos, saldoDisponible } = stats;

    // Gasto diario promedio hasta hoy
    const gastoDiarioPromedio = totalGastos / diaActual;
    // Proyección de gasto total a fin de mes
    const gastoProyectado = gastoDiarioPromedio * diasEnMes;
    // Cuánto puede gastar por día para no quedarse en rojo
    const gastoDiarioDisponible = saldoDisponible / diasRestantes;

    const notificaciones = [];

    // Alertas de proyección (email/notificación) — solo si el usuario las habilitó.
    // El cálculo de gastoDiarioDisponible sigue siempre, independiente de este flag,
    // porque el dashboard lo necesita como dato aunque las alertas estén apagadas.
    if (
        config.notificar_proyecciones &&
        gastoProyectado > ingresoMensual &&
        puedeDisparar('proyeccion_saldo_negativo')
    ) {
        const deficit = gastoProyectado - ingresoMensual;
        notificaciones.push({
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
        config.notificar_proyecciones &&
        objetivoAhorro > 0 &&
        ahorroProyectado < objetivoAhorro &&
        puedeDisparar('ahorro_en_riesgo')
    ) {
        notificaciones.push({
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

    return {
        notificaciones,
        // Proyección informativa: gasto diario disponible (sin throttle — es dato, no alerta)
        datos: {
            gastoDiarioDisponible: Math.max(0, gastoDiarioDisponible),
            gastoProyectado,
            diasRestantes,
        },
    };
};
