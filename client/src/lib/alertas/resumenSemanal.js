/**
 * Genera el resumen semanal de gastos agrupado por categoría.
 * Función pura: no hace I/O, solo calcula la notificación a partir de stats.
 * Toma los últimos 7 días desde hoy.
 *
 * @param {Object} stats - Resultado de getStats()
 * @returns {{ titulo: string, mensaje: string, tipo: string, origen: string, metadata: Object } | null}
 */
export const generarResumenSemanal = (stats) => {
    if (!stats) return null;

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

    return {
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
    };
};
