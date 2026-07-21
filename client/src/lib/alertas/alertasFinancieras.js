/**
 * Analiza las estadísticas financieras y arma las alertas a disparar según la configuración.
 * Función pura: no hace I/O; recibe `puedeDisparar` ya resuelto por el llamador
 * (el throttle en sí vive en localStorage, eso es efecto secundario del contexto).
 *
 * Reglas de Fase 2:
 * 1. Ingreso mensual no configurado (= 0) — corta acá, las demás alertas no tienen sentido
 * 2. Saldo disponible por debajo del umbral configurado
 * 3. Porcentaje del ingreso superado
 *
 * @param {Object} stats - Resultado de getStats()
 * @param {Object} config - Configuración de notificaciones del usuario
 * @param {(tipoAlerta: string) => boolean} puedeDisparar - Chequea/marca el throttle diario
 * @returns {Array<{ titulo: string, mensaje: string, tipo: string, origen: string, metadata?: Object }>}
 */
export const evaluarAlertasFinancieras = (stats, config, puedeDisparar) => {
    if (!stats) return [];

    const { saldoDisponible, ingresoMensual, totalGastos } = stats;

    // Alerta: ingreso mensual no configurado
    if (ingresoMensual === 0 && puedeDisparar('ingreso_no_configurado')) {
        return [{
            titulo:  'Ingreso mensual no configurado',
            mensaje: 'No registraste tu ingreso mensual. Configuralo para ver tu saldo disponible correctamente.',
            tipo:    'warning',
            origen:  'sistema',
        }];
        // Si no hay ingreso, las otras alertas no tienen sentido — cortocircuito preservado del original
    }

    const notificaciones = [];

    // Alerta: saldo disponible por debajo del umbral
    if (
        config.notificar_saldo_bajo &&
        ingresoMensual > 0 &&
        saldoDisponible < config.umbral_saldo_bajo &&
        puedeDisparar('saldo_bajo')
    ) {
        notificaciones.push({
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
        puedeDisparar('porcentaje_ingreso')
    ) {
        const porcentajeUsado = (totalGastos / ingresoMensual) * 100;
        if (porcentajeUsado >= config.porcentaje_maximo_ingreso) {
            notificaciones.push({
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

    return notificaciones;
};
