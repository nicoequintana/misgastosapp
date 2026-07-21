/**
 * Verifica si un gasto individual supera el monto alto configurado.
 * Función pura: no hace I/O, solo evalúa la regla y arma las notificaciones a crear.
 * No usa throttle (`puedeDisparar`) — la alerta original tampoco lo usaba: cada gasto
 * alto se notifica siempre, no está limitada a una vez por día.
 *
 * @param {Object} gasto - { descripcion, monto }
 * @param {Object} config - Configuración de notificaciones del usuario
 * @returns {Array<{ titulo: string, mensaje: string, tipo: string, origen: string, metadata: Object }>}
 */
export const evaluarAlertaGastoAlto = (gasto, config) => {
    if (!config?.notificar_gasto_alto) return [];
    if (Number(gasto.monto) < Number(config.monto_gasto_alto)) return [];

    return [{
        titulo:  'Gasto alto detectado',
        mensaje: `El gasto "${gasto.descripcion}" por $${Number(gasto.monto).toLocaleString('es-AR')} supera el umbral de $${Number(config.monto_gasto_alto).toLocaleString('es-AR')}.`,
        tipo:    'warning',
        origen:  'alertas_financieras',
        metadata: {
            descripcion:        gasto.descripcion,
            monto:              gasto.monto,
            umbral_configurado: config.monto_gasto_alto,
        },
    }];
};
