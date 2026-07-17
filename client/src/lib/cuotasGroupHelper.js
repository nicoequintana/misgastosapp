/**
 * Funciones puras para agrupar y procesar registros de cuotas.
 * Sin efectos secundarios ni dependencias de red.
 * Usadas por getTarjetasEnCuotas, getPrestamosEnCuotas y sus variantes futuras.
 */

/**
 * Agrupa un array de filas de gastos por id_gasto_padre.
 *
 * @param {Array} rows - Filas de gastos con id_gasto_padre
 * @returns {Object} Mapa { [id_gasto_padre]: row[] }
 */
export function agruparPorPadre(rows) {
    return rows.reduce((acc, g) => {
        const k = g.id_gasto_padre;
        if (!acc[k]) acc[k] = [];
        acc[k].push(g);
        return acc;
    }, {});
}

/**
 * Filtra filas cuyo método de pago acepta cuotas (flag explícito, no por nombre).
 *
 * @param {Array} rows
 * @returns {Array}
 */
export function filtrarTarjetaCredito(rows) {
    return rows.filter(g => g.metodos_pago?.acepta_cuotas === true);
}

/**
 * Filtra filas cuya categoría está marcada como préstamo (flag explícito, no por nombre).
 *
 * @param {Array} rows
 * @returns {Array}
 */
export function filtrarPrestamos(rows) {
    return rows.filter(g => g.categorias?.es_prestamo === true);
}

/**
 * Transforma un grupo de cuotas en el objeto de resumen que usan las cards del dashboard.
 *
 * @param {Array}  cuotas          - Cuotas del grupo (misma id_gasto_padre)
 * @param {string} hoyStr          - Fecha actual en formato YYYY-MM-DD
 * @param {string} mesCorrienteInicio - Inicio del mes en curso YYYY-MM-DD
 * @param {string} mesCorrienteFin    - Fin del mes en curso YYYY-MM-DD
 * @returns {Object}
 */
export function transformarGrupoCuotas(cuotas, hoyStr, mesCorrienteInicio, mesCorrienteFin) {
    const ordenadas = [...cuotas].sort((a, b) => a.numero_cuota - b.numero_cuota);
    const primera = ordenadas[0];
    const descripcionBase = primera.descripcion.replace(/\s*\(\d+\/\d+\)$/, '');
    const totalOriginal = ordenadas.reduce((s, c) => s + parseFloat(c.monto || 0), 0);
    const pagadas = ordenadas.filter(c => c.fecha.split('T')[0] <= hoyStr).length;
    const montoMesCorriente = ordenadas
        .filter(c => {
            const f = c.fecha.split('T')[0];
            return f >= mesCorrienteInicio && f <= mesCorrienteFin;
        })
        .reduce((s, c) => s + parseFloat(c.monto || 0), 0);

    return {
        id: primera.id_gasto_padre,
        descripcionBase,
        categoria: primera.categorias?.nombre || '—',
        totalOriginal: Math.round(totalOriginal * 100) / 100,
        cuotas: ordenadas.length,
        pagadas,
        pendientes: ordenadas.length - pagadas,
        montoMensual: parseFloat(primera.monto || 0),
        montoMesCorriente: Math.round(montoMesCorriente * 100) / 100,
        cuotasList: ordenadas,
    };
}

/**
 * Transforma un grupo de cuotas futuras en el objeto que usa la sección de gastos futuros.
 *
 * @param {Array}  cuotas        - Cuotas del grupo
 * @param {string} mesSigInicio  - Inicio del mes siguiente YYYY-MM-DD
 * @param {string} mesSigFin     - Fin del mes siguiente YYYY-MM-DD
 * @returns {Object}
 */
export function transformarGrupoCuotasFuturas(cuotas, mesSigInicio, mesSigFin) {
    const ordenadas = [...cuotas].sort((a, b) => (a.numero_cuota ?? 0) - (b.numero_cuota ?? 0));
    const primera = ordenadas[0];
    const descripcionBase = primera.descripcion.replace(/\s*\(\d+\/\d+\)$/, '');
    const montoMesSiguiente = ordenadas
        .filter(c => {
            const f = (c.fecha || '').split('T')[0];
            return f >= mesSigInicio && f <= mesSigFin;
        })
        .reduce((s, c) => s + parseFloat(c.monto || 0), 0);

    return {
        id: primera.id_gasto_padre,
        descripcionBase,
        categoria: primera.categorias?.nombre || '—',
        idCategoria: primera.categorias?.id || null,
        montoMensual: parseFloat(primera.monto || 0),
        montoMesSiguiente: Math.round(montoMesSiguiente * 100) / 100,
        cuotasFuturas: ordenadas,
    };
}
