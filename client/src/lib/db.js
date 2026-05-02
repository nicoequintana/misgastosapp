import { supabase } from './supabase';

/**
 * Capa de acceso a datos (Data Access Layer) para Supabase.
 * 
 * Cada función interactúa con una tabla específica. Las políticas RLS
 * de Supabase filtran automáticamente por user_id en las consultas de
 * lectura/escritura. Para inserciones, pasamos el user_id explícitamente.
 * 
 * Convención de errores: todas las funciones hacen throw del error
 * para que el llamador (service/hook) pueda manejarlo apropiadamente.
 */

// ==================== HELPERS INTERNOS ====================

/**
 * Obtiene el usuario autenticado actual.
 * Lanza un error descriptivo si no hay sesión activa.
 * 
 * @returns {Object} Objeto de usuario de Supabase
 * @throws {Error} Si no hay sesión activa
 */
const obtenerUsuarioActivo = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error('No hay sesión de usuario activa. Por favor, iniciá sesión nuevamente.');
    }

    return user;
};

// ==================== GASTOS ====================

/**
 * Obtiene todos los gastos del usuario autenticado.
 * Incluye datos relacionados de categoría y método de pago.
 * 
 * @returns {Array} Lista de gastos ordenados por fecha descendente
 */
export const getExpenses = async () => {
    const { data, error } = await supabase
        .from('gastos')
        .select(`
            *,
            categorias:id_categoria (id, nombre),
            metodos_pago:id_metodo_pago (id, nombre)
        `)
        .order('fecha', { ascending: false });

    if (error) throw error;
    return data ?? [];
};

/**
 * Crea un nuevo gasto para el usuario autenticado.
 * La descripción se normaliza a mayúsculas para consistencia.
 * 
 * @param {Object} gasto - Datos del gasto a crear
 * @param {string} gasto.descripcion - Descripción del gasto
 * @param {number} gasto.monto - Monto del gasto (se convierte a número)
 * @param {string} gasto.id_categoria - ID de la categoría
 * @param {string} gasto.id_metodo_pago - ID del método de pago
 * @param {string} gasto.fecha - Fecha en formato ISO
 * @param {boolean} gasto.es_fijo - Si es un gasto fijo mensual
 * @returns {Object} El gasto creado
 */
export const createExpense = async (gasto) => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('gastos')
        .insert([{
            user_id: usuario.id,
            descripcion: (gasto.descripcion || '').trim().toUpperCase(),
            monto: Number(gasto.monto) || 0,
            id_categoria: gasto.id_categoria || null,
            id_metodo_pago: gasto.id_metodo_pago || null,
            fecha: gasto.fecha || new Date().toISOString().split('T')[0],
            es_fijo: Boolean(gasto.es_fijo)
        }])
        .select()
        .single();

    if (error) {
        console.error('❌ Error en createExpense:', error);
        throw error;
    }
    return data;
};

/**
 * Actualiza un gasto existente por su ID.
 * Solo actualiza los campos editables (no el user_id ni el id).
 * 
 * @param {string} id - ID del gasto a actualizar
 * @param {Object} gasto - Nuevos datos del gasto
 * @returns {Object} El gasto actualizado
 */
export const updateExpense = async (id, gasto) => {
    const { data, error } = await supabase
        .from('gastos')
        .update({
            descripcion: (gasto.descripcion || '').trim().toUpperCase(),
            monto: Number(gasto.monto) || 0,
            id_categoria: gasto.id_categoria || null,
            id_metodo_pago: gasto.id_metodo_pago || null,
            fecha: gasto.fecha,
            es_fijo: Boolean(gasto.es_fijo)
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('❌ Error en updateExpense:', error);
        throw error;
    }
    return data;
};

/**
 * Elimina un gasto por su ID.
 * 
 * @param {string} id - ID del gasto a eliminar
 */
export const deleteExpense = async (id) => {
    const { error } = await supabase
        .from('gastos')
        .delete()
        .eq('id', id);

    if (error) throw error;
};

/**
 * Elimina todos los gastos NO fijos del usuario autenticado.
 * Útil para el "reseteo mensual" de gastos variables.
 * RLS garantiza que solo se borren los gastos del usuario actual.
 */
export const deleteVariableExpenses = async () => {
    const { error } = await supabase
        .from('gastos')
        .delete()
        .eq('es_fijo', false);

    if (error) throw error;
};

// ==================== CATEGORÍAS ====================

/**
 * Obtiene todas las categorías activas del usuario.
 * 
 * @returns {Array} Lista de categorías ordenadas alfabéticamente
 */
export const getCategories = async () => {
    const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .order('nombre');

    if (error) throw error;
    return data ?? [];
};

/**
 * Obtiene todos los métodos de pago.
 * Ahora son globales y vienen pre-configurados en Supabase.
 * 
 * @returns {Array} Lista de métodos de pago ordenados alfabéticamente
 */
export const getPaymentMethods = async () => {
    const { data, error } = await supabase
        .from('metodos_pago')
        .select('*')
        .order('nombre');

    if (error) throw error;
    return data ?? [];
};

/**
 * [DEPRECATED] Los métodos de pago son ahora globales de sistema.
 * Se mantienen por compatibilidad si fueran necesarios, pero no tienen uso en la UI actual.
 */
// eslint-disable-next-line no-unused-vars
export const updatePaymentMethod = async (id, nombre) => {
    console.warn('updatePaymentMethod is deprecated.');
    return null;
};

// eslint-disable-next-line no-unused-vars
export const deletePaymentMethod = async (id) => {
    console.warn('deletePaymentMethod is deprecated.');
    return null;
};

// ==================== INGRESOS ====================

/**
 * Obtiene el ingreso activo del usuario.
 * Si no existe ninguno, retorna monto 0 sin crear filas vacías.
 */
export const getIncome = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('ingresos')
        .select('*')
        .eq('user_id', usuario.id)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('❌ Error en getIncome:', error);
        throw error;
    }

    return data ?? { monto: 0 };
};

/**
 * Guarda el ingreso del usuario.
 * Si ya existe un registro, lo actualiza. Si no, lo crea.
 * La fecha de actualización la gestiona Supabase automáticamente.
 */
export const saveIncome = async (monto) => {
    const usuario = await obtenerUsuarioActivo();
    const montoLimpio = Number(monto) || 0;

    const { data: existente, error: errorBusqueda } = await supabase
        .from('ingresos')
        .select('id')
        .eq('user_id', usuario.id)
        .limit(1)
        .maybeSingle();

    if (errorBusqueda) throw errorBusqueda;

    if (existente) {
        const { data, error } = await supabase
            .from('ingresos')
            .update({ monto: montoLimpio, fecha_actualizacion: new Date().toISOString() })
            .eq('id', existente.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    const { data, error } = await supabase
        .from('ingresos')
        .insert([{ user_id: usuario.id, monto: montoLimpio }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

// ==================== PERFIL DE USUARIO ====================

/**
 * Obtiene el perfil del usuario autenticado desde la tabla usuarios.
 * Incluye el theme_id persistido.
 *
 * @returns {Object|null} Perfil del usuario o null si no existe aún
 */
export const getPerfilUsuario = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', usuario.id)
        .maybeSingle();

    if (error) {
        console.error('❌ Error en getPerfilUsuario:', error);
        throw error;
    }

    return data;
};

/**
 * Actualiza el theme_id del usuario autenticado.
 * Solo toca la columna theme_id para no pisar otros datos del perfil.
 *
 * @param {string} themeId - ID del tema a guardar (ej: 'dark-ocean', 'light-azure')
 * @returns {Object} Perfil actualizado
 */
export const updateThemeUsuario = async (themeId) => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('usuarios')
        .update({ theme_id: themeId, ultima_actualizacion: new Date().toISOString() })
        .eq('id', usuario.id)
        .select()
        .single();

    if (error) {
        console.error('❌ Error en updateThemeUsuario:', error);
        throw error;
    }

    return data;
};

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
    // Obtener gastos e ingresos en paralelo para reducir latencia
    const [gastos, ingreso] = await Promise.all([
        getExpenses(),
        getIncome()
    ]);

    // Calcular totales
    const totalGastos = gastos.reduce((suma, gasto) => suma + parseFloat(gasto.monto || 0), 0);
    const gastosFijos = gastos
        .filter(gasto => gasto.es_fijo)
        .reduce((suma, gasto) => suma + parseFloat(gasto.monto || 0), 0);
    const gastosVariables = totalGastos - gastosFijos;
    const saldoDisponible = (ingreso?.monto || 0) - totalGastos;

    // Agrupar gastos por categoría para gráficos/informes
    const porCategoria = gastos.reduce((acumulador, gasto) => {
        const nombreCategoria = gasto.categorias?.nombre || 'Sin categoría';
        if (!acumulador[nombreCategoria]) {
            acumulador[nombreCategoria] = { total: 0, cantidad: 0 };
        }
        acumulador[nombreCategoria].total += parseFloat(gasto.monto || 0);
        acumulador[nombreCategoria].cantidad += 1;
        return acumulador;
    }, {});

    return {
        totalGastos,
        gastosFijos,
        gastosVariables,
        saldoDisponible,
        ingresoMensual: ingreso?.monto || 0,
        gastos,
        porCategoria
    };
};
