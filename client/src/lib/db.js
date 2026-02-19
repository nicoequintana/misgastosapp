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
        .eq('activo', true)
        .order('nombre');

    if (error) throw error;
    return data ?? [];
};

/**
 * Crea una nueva categoría para el usuario autenticado.
 * 
 * @param {string} nombre - Nombre de la categoría
 * @returns {Object} La categoría creada
 */
export const createCategory = async (nombre) => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('categorias')
        .insert([{
            user_id: usuario.id,
            nombre: nombre.trim().toUpperCase(),
            activo: true
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Actualiza el nombre de una categoría existente.
 * 
 * @param {string} id - ID de la categoría
 * @param {string} nombre - Nuevo nombre
 * @returns {Object} La categoría actualizada
 */
export const updateCategory = async (id, nombre) => {
    const { data, error } = await supabase
        .from('categorias')
        .update({ nombre: nombre.trim().toUpperCase() })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Realiza un "soft delete" de una categoría (la marca como inactiva).
 * No se elimina físicamente para preservar la integridad referencial
 * con los gastos que ya la usan.
 * 
 * @param {string} id - ID de la categoría a desactivar
 */
export const deleteCategory = async (id) => {
    const { error } = await supabase
        .from('categorias')
        .update({ activo: false })
        .eq('id', id);

    if (error) throw error;
};

// ==================== MÉTODOS DE PAGO ====================

/**
 * Obtiene todos los métodos de pago activos del usuario.
 * 
 * @returns {Array} Lista de métodos de pago ordenados alfabéticamente
 */
export const getPaymentMethods = async () => {
    const { data, error } = await supabase
        .from('metodos_pago')
        .select('*')
        .eq('activo', true)
        .order('nombre');

    if (error) throw error;
    return data ?? [];
};

/**
 * Crea un nuevo método de pago para el usuario autenticado.
 * 
 * @param {string} nombre - Nombre del método de pago
 * @returns {Object} El método de pago creado
 */
export const createPaymentMethod = async (nombre) => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('metodos_pago')
        .insert([{
            user_id: usuario.id,
            nombre: nombre.trim().toUpperCase(),
            activo: true
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Actualiza el nombre de un método de pago existente.
 * 
 * @param {string} id - ID del método de pago
 * @param {string} nombre - Nuevo nombre
 * @returns {Object} El método de pago actualizado
 */
export const updatePaymentMethod = async (id, nombre) => {
    const { data, error } = await supabase
        .from('metodos_pago')
        .update({ nombre: nombre.trim().toUpperCase() })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Realiza un "soft delete" de un método de pago (lo marca como inactivo).
 * 
 * @param {string} id - ID del método de pago a desactivar
 */
export const deletePaymentMethod = async (id) => {
    const { error } = await supabase
        .from('metodos_pago')
        .update({ activo: false })
        .eq('id', id);

    if (error) throw error;
};

// ==================== INGRESOS ====================

/**
 * Obtiene el registro de ingreso mensual del usuario autenticado.
 * 
 * NOTA: Filtra explícitamente por user_id para máxima seguridad,
 * aunque RLS ya lo garantiza. Si no existe un registro previo,
 * crea uno con monto 0 automáticamente.
 * 
 * @returns {Object} El registro de ingreso del usuario
 */
export const getIncome = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('ingresos')
        .select('*')
        .eq('user_id', usuario.id)
        .limit(1) // Evitar error PGRST116 si existen duplicados
        .maybeSingle();

    if (error) {
        console.error('❌ Error en getIncome:', error);
        throw error;
    }

    // Si no existe un registro de ingreso, crear uno por defecto con monto 0
    if (!data) {
        console.info('ℹ️ No se encontró ingreso previo. Creando registro inicial.');
        return await createIncome(0, usuario.id);
    }

    return data;
};

/**
 * Crea un registro de ingreso inicial para el usuario.
 * Se llama internamente cuando getIncome no encuentra datos.
 * 
 * @param {number} monto - Monto inicial (generalmente 0)
 * @param {string} userId - ID del usuario (opcional, se obtiene si no se pasa)
 * @returns {Object} El registro de ingreso creado
 */
export const createIncome = async (monto, userId = null) => {
    // Si no se pasa userId, lo obtenemos (para llamadas directas)
    const idUsuario = userId || (await obtenerUsuarioActivo()).id;

    const { data, error } = await supabase
        .from('ingresos')
        .insert([{
            user_id: idUsuario,
            monto: Number(monto) || 0
        }])
        .select()
        .single();

    if (error) {
        console.error('❌ Error en createIncome:', error);
        throw error;
    }
    return data;
};

/**
 * Actualiza el ingreso mensual del usuario. 
 * Si no existe un registro previo, lo crea (upsert lógico).
 * 
 * @param {number} monto - Nuevo monto de ingreso mensual
 * @returns {Object} El registro de ingreso actualizado o creado
 */
export const updateIncome = async (monto) => {
    const usuario = await obtenerUsuarioActivo();
    const montoLimpio = Number(monto) || 0;

    // Buscar registro existente del usuario
    const { data: existente, error: errorBusqueda } = await supabase
        .from('ingresos')
        .select('id')
        .eq('user_id', usuario.id)
        .limit(1) // Evitar error PGRST116 si existen duplicados
        .maybeSingle();

    if (errorBusqueda) {
        console.error('❌ Error al buscar ingreso para actualizar:', errorBusqueda);
        throw errorBusqueda;
    }

    if (existente) {
        // Actualizar el registro existente
        const { data, error } = await supabase
            .from('ingresos')
            .update({ monto: montoLimpio })
            .eq('id', existente.id)
            .select()
            .single();

        if (error) {
            console.error('❌ Error al actualizar ingreso:', error);
            throw error;
        }
        return data;
    }

    // Si no hay registro, crear uno nuevo
    console.info('ℹ️ No existía registro de ingreso. Creando uno nuevo.');
    return await createIncome(montoLimpio, usuario.id);
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
