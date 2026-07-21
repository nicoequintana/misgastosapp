/**
 * Genera el resumen mensual del mes en curso.
 * Función pura: no hace I/O, solo calcula la notificación a partir de stats.
 * Muestra totales, fijos vs variables, y top categorías.
 *
 * @param {Object} stats - Resultado de getStats()
 * @returns {{ titulo: string, mensaje: string, tipo: string, origen: string, metadata: Object } | null}
 */
export const generarResumenMensual = (stats) => {
    if (!stats) return null;

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

    return {
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
    };
};
