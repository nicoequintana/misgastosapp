/**
 * Detecta si alguna categoría concentra demasiado del gasto total del mes.
 * Función pura: no hace I/O; recibe `puedeDisparar` ya resuelto por el llamador
 * (el throttle en sí vive en localStorage, eso es efecto secundario del contexto).
 *
 * @param {Object} stats - Resultado de getStats()
 * @param {Object} config - Configuración de notificaciones del usuario
 * @param {(tipoAlerta: string) => boolean} puedeDisparar - Chequea/marca el throttle diario
 * @returns {Array<{ titulo: string, mensaje: string, tipo: string, origen: string, metadata: Object }>}
 */
export const evaluarAlertaConcentracionCategoria = (stats, config, puedeDisparar) => {
    if (!stats || stats.totalGastos === 0) return [];
    if (!config?.notificar_concentracion_categoria) return [];
    if (!puedeDisparar('concentracion_categoria')) return [];

    const umbral = Number(config.porcentaje_concentracion_categoria);

    // Buscar la categoría con mayor porcentaje
    const entrada = Object.entries(stats.porCategoria || {})
        .map(([nombre, datos]) => ({
            nombre,
            porcentaje: (datos.total / stats.totalGastos) * 100,
            total: datos.total,
        }))
        .find(c => c.porcentaje >= umbral);

    if (!entrada) return [];

    return [{
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
    }];
};
