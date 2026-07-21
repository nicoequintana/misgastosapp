import { supabase } from '../supabase';

/**
 * Helpers internos compartidos por los módulos de dominio de db/.
 * No se exponen desde el barrel público (client/src/lib/db.js) salvo
 * `calcularAgregadosGastos`, que ya era pública en el archivo original.
 */

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

// Tope de cuotas para gastos personales (tarjeta de crédito o préstamo).
// Distinto del tope de gastos grupales (MAX_CUOTAS_GRUPAL) — son límites de
// negocio independientes, no el mismo valor desincronizado.
export const MAX_CUOTAS_PERSONAL = 120;

// Tope de cuotas para gastos grupales — coincide con OPCIONES_CUOTAS en
// useGrupoGastoForm.js y con el clamp del RPC create_grupo_gasto_installments.
export const MAX_CUOTAS_GRUPAL = 18;

/**
 * Obtiene el usuario autenticado actual.
 * Lanza un error descriptivo si no hay sesión activa.
 *
 * @returns {Object} Objeto de usuario de Supabase
 * @throws {Error} Si no hay sesión activa
 */
export const obtenerUsuarioActivo = async () => {
    // getSession() lee desde caché local (sin request HTTP).
    // getUser() valida contra el servidor cada vez — innecesario aquí
    // porque RLS en Supabase valida el JWT en cada query de todas formas.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
        throw new Error('No hay sesión de usuario activa. Por favor, iniciá sesión nuevamente.');
    }

    return user;
};

/**
 * Obtiene el access_token de la sesión activa.
 * Lanza error si no hay sesión — usado por operaciones que llaman al backend.
 * @returns {string} JWT access token
 */
export const obtenerTokenActivo = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');
    return session.access_token;
};

/**
 * Calcula el año y mes del mes siguiente a partir de un año y mes dados.
 * Maneja el salto de diciembre a enero.
 * @param {number} year  - Año de referencia
 * @param {number} month - Mes 1-indexado (1-12)
 * @returns {{ anio: number, mes: number, desde: string, hasta: string }}
 */
export const calcularMesSiguiente = (year, month) => {
    const mes   = month === 12 ? 1 : month + 1;
    const anio  = month === 12 ? year + 1 : year;
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anio, mes, 0).getDate();
    const hasta  = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
    return { anio, mes, desde, hasta };
};

/**
 * Valida que un valor sea un número mayor a cero.
 * @param {any} valor
 * @throws {Error} Si el valor no es válido
 */
export const validarMonto = (valor) => {
    const num = Number(valor);
    if (isNaN(num) || num <= 0) throw new Error('El monto debe ser mayor a cero');
};

/**
 * Agrupa gastos por nombre de categoría.
 * @param {Array} gastos
 * @param {boolean} conPorcentaje - Si true, agrega el campo porcentaje
 * @returns {Object} Mapa { [nombreCategoria]: { total, cantidad, porcentaje? } }
 */
export const agruparPorCategoria = (gastos, conPorcentaje = false) => {
    const totalGlobal = conPorcentaje
        ? gastos.reduce((s, g) => s + parseFloat(g.monto || 0), 0)
        : 0;

    const mapa = gastos.reduce((acc, g) => {
        const nombre = g.categorias?.nombre || 'Sin categoría';
        if (!acc[nombre]) acc[nombre] = { total: 0, cantidad: 0 };
        acc[nombre].total    += parseFloat(g.monto || 0);
        acc[nombre].cantidad += 1;
        return acc;
    }, {});

    if (conPorcentaje) {
        Object.values(mapa).forEach(c => {
            c.porcentaje = totalGlobal > 0 ? (c.total / totalGlobal) * 100 : 0;
        });
    }

    return mapa;
};

/**
 * Calcula los totales agregados (total/fijos/variables) de una lista de gastos.
 * Mismo cálculo que repetían getStats, getReporteByRango y getStatsByMonth (R10).
 * @param {Array} gastos
 * @returns {{ totalGastos: number, gastosFijos: number, gastosVariables: number }}
 */
export const calcularAgregadosGastos = (gastos) => {
    const totalGastos = gastos.reduce((s, g) => s + parseFloat(g.monto || 0), 0);
    const gastosFijos = gastos.filter(g => g.es_fijo).reduce((s, g) => s + parseFloat(g.monto || 0), 0);
    const gastosVariables = totalGastos - gastosFijos;
    return { totalGastos, gastosFijos, gastosVariables };
};
