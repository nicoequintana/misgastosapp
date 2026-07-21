import { fechaHoyArgentina } from '../../utils/format';

/**
 * Genera el resumen diario de gastos del día de hoy.
 * Función pura: no hace I/O, solo calcula la notificación a partir de stats.
 *
 * @param {Object} stats - Resultado de getStats() actual
 * @returns {{ titulo: string, mensaje: string, tipo: string, origen: string, metadata: Object } | null}
 */
export const generarResumenDiario = (stats) => {
    if (!stats) return null;

    const hoy = fechaHoyArgentina();
    const gastosHoy = (stats.gastos || []).filter(g => {
        const fechaGasto = (g.fecha || '').split('T')[0];
        return fechaGasto === hoy;
    });

    const totalHoy = gastosHoy.reduce((s, g) => s + parseFloat(g.monto || 0), 0);

    return {
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
    };
};
