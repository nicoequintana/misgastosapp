/**
 * Verifica alertas relacionadas con gastos fijos y variables del mes.
 * Función pura: no hace I/O. El fetch de statsMesAnterior (con su caché) es responsabilidad
 * del contexto — acá se recibe ya resuelto.
 * Compara el mes actual contra el mes anterior para detectar pendientes y crecimientos.
 *
 * @param {Object} stats - Resultado de getStats() del mes actual
 * @param {Object|null} statsMesAnterior - Resultado de getStatsByMonth() del mes anterior, o null si falló/no aplica
 * @param {Object} config - Configuración de notificaciones del usuario
 * @param {(tipoAlerta: string) => boolean} puedeDisparar - Chequea/marca el throttle diario
 * @returns {Array<{ titulo: string, mensaje: string, tipo: string, origen: string, metadata: Object }>}
 */
export const evaluarAlertasGastosFijos = (stats, statsMesAnterior, config, puedeDisparar) => {
    if (!stats || stats.ingresoMensual === 0) return [];

    const notificaciones = [];

    // Alerta: gastos fijos superan % del ingreso
    if (
        config.notificar_gastos_fijos_exceso &&
        puedeDisparar('gastos_fijos_exceso')
    ) {
        const porcentajeFijos = (stats.gastosFijos / stats.ingresoMensual) * 100;
        if (porcentajeFijos >= Number(config.umbral_fijos_ingreso)) {
            notificaciones.push({
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
        puedeDisparar('gastos_fijos_pendientes')
    ) {
        const fijosAnterior = statsMesAnterior.gastosFijosLista.length;
        const fijosActual = (stats.gastos || []).filter(g => g.es_fijo).length;

        if (fijosAnterior > 0 && fijosActual < fijosAnterior) {
            const faltantes = fijosAnterior - fijosActual;
            notificaciones.push({
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
        puedeDisparar('variables_crecimiento')
    ) {
        const margen = Number(config.margen_crecimiento_variables) / 100;
        const umbralVariables = statsMesAnterior.gastosVariables * (1 + margen);
        if (stats.gastosVariables > umbralVariables) {
            const crecimiento = ((stats.gastosVariables / statsMesAnterior.gastosVariables) - 1) * 100;
            notificaciones.push({
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

    return notificaciones;
};
