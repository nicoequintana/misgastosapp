import { supabase } from '../supabase';
import { obtenerUsuarioActivo, calcularMesSiguiente, calcularAgregadosGastos, agruparPorCategoria } from './_helpers';
import { getExpenses } from './expenses';
import { getIncomeTotalByMonth } from './incomes';

// ==================== ESTADÍSTICAS ====================

/**
 * Calcula las estadísticas financieras consolidadas del usuario.
 * Obtiene gastos e ingresos en paralelo para mejor performance.
 *
 * @returns {Object} Objeto con totales, saldo, desglose y lista de gastos
 * @example
 * const stats = await getStats();
 * // { totalGastos, gastosFijos, gastosVariables, saldoDisponible,
 * //   ingresoMensual, gastos, porCategoria }
 */
export const getStats = async () => {
    const hoy  = new Date();
    const year  = hoy.getFullYear();
    const month = hoy.getMonth() + 1;

    // Gastos e ingresos del mes actual en paralelo
    const [gastos, ingresoMensual] = await Promise.all([
        getExpenses(),
        getIncomeTotalByMonth(year, month),
    ]);

    const { totalGastos, gastosFijos, gastosVariables } = calcularAgregadosGastos(gastos);
    const saldoDisponible = ingresoMensual - totalGastos;

    return {
        totalGastos,
        gastosFijos,
        gastosVariables,
        saldoDisponible,
        ingresoMensual,
        gastos,
        porCategoria: agruparPorCategoria(gastos),
    };
};

/**
 * Obtiene todos los gastos de un rango de fechas arbitrario.
 * Base para el módulo de reportes: filtra por desde/hasta inclusive.
 *
 * @param {string} desde - Fecha 'YYYY-MM-DD' inicio
 * @param {string} hasta - Fecha 'YYYY-MM-DD' fin
 * @returns {Array} Lista de gastos con datos de categoría y método de pago
 */
export const getGastosByRango = async (desde, hasta) => {
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRegex.test(desde) || !fechaRegex.test(hasta)) {
        throw new Error('Formato de fecha inválido. Use YYYY-MM-DD');
    }

    const usuario = await obtenerUsuarioActivo();

    // Comparamos solo la parte de fecha (YYYY-MM-DD) para evitar desfases UTC vs local.
    // La columna 'fecha' puede tener timestamp — usamos cast a date para comparar correctamente.
    const diaSigniente = new Date(`${hasta}T00:00:00`);
    diaSigniente.setDate(diaSigniente.getDate() + 1);
    const hastaExclusivo = diaSigniente.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            *,
            categorias:id_categoria (id, nombre),
            metodos_pago:id_metodo_pago (id, nombre, acepta_cuotas)
        `)
        .eq('user_id', usuario.id)
        .gte('fecha', desde)
        .lt('fecha', hastaExclusivo)
        .order('fecha', { ascending: false });

    if (error) throw error;
    return data ?? [];
};

/**
 * Calcula estadísticas completas para un rango de fechas.
 * Incluye totales, desglose por categoría, por método de pago y evolución diaria.
 * Diseñado para alimentar el módulo de Reportes.
 *
 * @param {string} desde - Fecha 'YYYY-MM-DD' inicio
 * @param {string} hasta - Fecha 'YYYY-MM-DD' fin
 * @returns {Object} { gastos, totalGastos, gastosFijos, gastosVariables, ingresoMensual, porCategoria, porMetodoPago, porDia }
 */
export const getReporteByRango = async (desde, hasta) => {
    const [gastos, ingreso] = await Promise.all([
        getGastosByRango(desde, hasta),
        // Ingresos del mes al que pertenece el rango (usa el mes de inicio del rango)
        getIncomeTotalByMonth(
            parseInt(desde.substring(0, 4)),
            parseInt(desde.substring(5, 7))
        ).then(total => ({ monto: total })),
    ]);

    const { totalGastos, gastosFijos, gastosVariables } = calcularAgregadosGastos(gastos);

    // Desglose por categoría con porcentaje sobre el total
    const porCategoria = agruparPorCategoria(gastos, true);

    // Desglose por método de pago
    const porMetodoPago = gastos.reduce((acc, g) => {
        const nombre = g.metodos_pago?.nombre || 'Sin método';
        if (!acc[nombre]) acc[nombre] = { total: 0, cantidad: 0 };
        acc[nombre].total    += parseFloat(g.monto || 0);
        acc[nombre].cantidad += 1;
        return acc;
    }, {});

    // Evolución diaria para el gráfico de barras
    const porDia = gastos.reduce((acc, g) => {
        const fecha = (g.fecha || '').split('T')[0];
        if (!acc[fecha]) acc[fecha] = { total: 0, cantidad: 0 };
        acc[fecha].total    += parseFloat(g.monto || 0);
        acc[fecha].cantidad += 1;
        return acc;
    }, {});

    return {
        gastos,
        totalGastos,
        gastosFijos,
        gastosVariables,
        ingresoMensual: ingreso?.monto || 0,
        porCategoria,
        porMetodoPago,
        porDia,
    };
};

/**
 * Calcula estadísticas de gastos para un mes y año específicos.
 * Útil para comparar el mes actual contra el anterior en alertas de Fase 4.
 *
 * @param {number} year  - Año (ej: 2025)
 * @param {number} month - Mes 1-indexado (1=enero ... 12=diciembre)
 * @returns {Object} { totalGastos, gastosFijos, gastosVariables, gastosFijosLista, porCategoria }
 */
export const getStatsByMonth = async (year, month) => {
    const usuario = await obtenerUsuarioActivo();

    // Construimos las fechas como strings YYYY-MM-DD para evitar desfases UTC en Argentina (UTC-3).
    const mesStr = String(month).padStart(2, '0');
    const desde = `${year}-${mesStr}-01`;
    const { desde: hasta } = calcularMesSiguiente(year, month);

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            *,
            categorias:id_categoria (id, nombre)
        `)
        .eq('user_id', usuario.id)
        .gte('fecha', desde)
        .lt('fecha', hasta)
        .order('fecha', { ascending: false });

    if (error) throw error;

    const gastos = data ?? [];
    const gastosFijosLista = gastos.filter(g => g.es_fijo);
    const { totalGastos, gastosFijos, gastosVariables } = calcularAgregadosGastos(gastos);

    return { totalGastos, gastosFijos, gastosVariables, gastosFijosLista, porCategoria: agruparPorCategoria(gastos) };
};
