import { supabase } from '../supabase';
import { obtenerUsuarioActivo, calcularMesSiguiente, validarMonto } from './_helpers';

// ==================== INGRESOS ====================

/**
 * Obtiene todos los ingresos del usuario en un mes/año específico.
 * Ordenados por fecha descendente.
 *
 * @param {number} year  - Año (ej: 2026)
 * @param {number} month - Mes 1-indexado (1=enero … 12=diciembre)
 * @returns {Array} Lista de ingresos del período, con datos de categoría
 */
export const getIncomesByMonth = async (year, month) => {
    const usuario = await obtenerUsuarioActivo();

    const mesStr = String(month).padStart(2, '0');
    const desde  = `${year}-${mesStr}-01`;
    const { desde: hasta } = calcularMesSiguiente(year, month);

    const { data, error } = await supabase
        .from('ingresos')
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .eq('user_id', usuario.id)
        .gte('fecha', desde)
        .lt('fecha', hasta)
        .order('fecha', { ascending: false });

    if (error) {
        console.error('❌ Error en getIncomesByMonth:', error);
        throw error;
    }

    return data ?? [];
};

/**
 * Retorna la suma de ingresos del usuario para un mes/año.
 * Devuelve 0 si no hay registros en ese período.
 *
 * @param {number} year
 * @param {number} month
 * @returns {number} Total de ingresos del período
 */
export const getIncomeTotalByMonth = async (year, month) => {
    const ingresos = await getIncomesByMonth(year, month);
    return ingresos.reduce((suma, i) => suma + parseFloat(i.monto || 0), 0);
};

/**
 * Crea un nuevo ingreso para el usuario.
 * No permite fechas anteriores al mes actual (bloquea cargar hacia atrás).
 *
 * @param {Object} data
 * @param {number} data.monto       - Monto del ingreso (obligatorio, > 0)
 * @param {string} data.fecha       - Fecha YYYY-MM-DD (obligatorio, no puede ser mes anterior)
 * @param {string} [data.descripcion]
 * @param {number} [data.categoria_id]
 * @returns {Object} El ingreso creado
 */
export const createIncome = async ({ monto, fecha, descripcion, categoria_id }) => {
    const usuario = await obtenerUsuarioActivo();

    validarMonto(monto);
    const montoNum = Number(monto);

    // Validar que la fecha no sea de un mes anterior al actual
    const hoy        = new Date();
    const periodoMin = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fechaIngreso = new Date(`${fecha}T12:00:00`);
    if (fechaIngreso < periodoMin) {
        throw new Error('No podés registrar ingresos en meses anteriores al actual');
    }

    const payload = {
        user_id:     usuario.id,
        monto:       montoNum,
        fecha,
        origen:      'manual',
        fecha_creacion:     new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString(),
    };
    if (descripcion?.trim()) payload.descripcion = descripcion.trim();
    if (categoria_id)        payload.categoria_id = categoria_id;

    const { data, error } = await supabase
        .from('ingresos')
        .insert(payload)
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .single();

    if (error) {
        console.error('❌ Error en createIncome:', error);
        throw error;
    }

    return data;
};

/**
 * Actualiza un ingreso existente del usuario.
 * No permite mover el ingreso a un mes anterior al actual.
 *
 * @param {number} id    - ID del ingreso a actualizar
 * @param {Object} data  - Campos a actualizar: monto, fecha, descripcion, categoria_id
 * @returns {Object} El ingreso actualizado
 */
export const updateIncome = async (id, { monto, fecha, descripcion, categoria_id }) => {
    const usuario = await obtenerUsuarioActivo();

    if (monto !== undefined) validarMonto(monto);

    if (fecha) {
        const hoy        = new Date();
        const periodoMin = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const fechaIngreso = new Date(`${fecha}T12:00:00`);
        if (fechaIngreso < periodoMin) {
            throw new Error('No podés mover un ingreso a un mes anterior al actual');
        }
    }

    const payload = { fecha_actualizacion: new Date().toISOString() };
    if (monto       !== undefined) payload.monto       = Number(monto);
    if (fecha       !== undefined) payload.fecha       = fecha;
    if (descripcion !== undefined) payload.descripcion = descripcion?.trim() || null;
    if (categoria_id !== undefined) payload.categoria_id = categoria_id || null;

    const { data, error } = await supabase
        .from('ingresos')
        .update(payload)
        .eq('id', id)
        .eq('user_id', usuario.id)
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .single();

    if (error) {
        console.error('❌ Error en updateIncome:', error);
        throw error;
    }

    return data;
};

/**
 * Elimina un ingreso del usuario por ID.
 * RLS garantiza que solo puede eliminar los propios.
 *
 * @param {number} id - ID del ingreso a eliminar
 */
export const deleteIncome = async (id) => {
    const usuario = await obtenerUsuarioActivo();

    const { error } = await supabase
        .from('ingresos')
        .delete()
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) {
        console.error('❌ Error en deleteIncome:', error);
        throw error;
    }
};

/**
 * Obtiene todas las categorías de ingresos disponibles para el usuario.
 * Incluye globales (user_id IS NULL) y personales del usuario.
 *
 * @returns {Array} Lista de categorías con flag es_propia
 */
export const getIncomeCategories = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('categorias_ingresos')
        .select('*')
        .eq('activa', true)
        .order('nombre');

    if (error) {
        console.error('❌ Error en getIncomeCategories:', error);
        throw error;
    }

    return (data ?? []).map(c => ({ ...c, es_propia: c.user_id === usuario.id }));
};
