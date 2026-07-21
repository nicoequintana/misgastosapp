import { supabase } from '../supabase';
import { obtenerUsuarioActivo, calcularMesSiguiente, validarMonto } from './_helpers';
import { getIncomesByMonth } from './incomes';

// ==================== INGRESOS RECURRENTES ====================

/**
 * Obtiene todos los ingresos recurrentes del usuario (activos e inactivos).
 */
export const getRecurringIncomes = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('ingresos_recurrentes')
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .eq('user_id', usuario.id)
        .order('fecha_creacion', { ascending: false });

    if (error) {
        console.error('❌ Error en getRecurringIncomes:', error);
        throw error;
    }

    return data ?? [];
};

/**
 * Crea un ingreso recurrente.
 *
 * @param {Object} data
 * @param {string} data.descripcion   - Obligatorio
 * @param {number} data.monto         - Obligatorio, > 0
 * @param {number} [data.categoria_id]
 * @param {number} [data.dia_estimado] - Día del mes esperado (1-31)
 * @param {string} [data.fecha_inicio] - YYYY-MM-DD, default hoy
 */
export const createRecurringIncome = async ({ descripcion, monto, categoria_id, dia_estimado, fecha_inicio }) => {
    const usuario = await obtenerUsuarioActivo();

    validarMonto(monto);
    const montoNum = Number(monto);
    if (!descripcion?.trim()) throw new Error('La descripción es obligatoria');

    const hoy = new Date();
    const payload = {
        user_id:     usuario.id,
        descripcion: descripcion.trim().toUpperCase(),
        monto:       montoNum,
        frecuencia:  'mensual',
        activo:      true,
        fecha_inicio: fecha_inicio ?? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`,
    };
    if (categoria_id)  payload.categoria_id  = categoria_id;
    if (dia_estimado)  payload.dia_estimado  = Number(dia_estimado);

    const { data, error } = await supabase
        .from('ingresos_recurrentes')
        .insert(payload)
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .single();

    if (error) {
        console.error('❌ Error en createRecurringIncome:', error);
        throw error;
    }

    return data;
};

/**
 * Actualiza un ingreso recurrente existente.
 *
 * @param {number} id
 * @param {Object} data - Campos a actualizar: descripcion, monto, categoria_id, dia_estimado, activo, fecha_fin
 */
export const updateRecurringIncome = async (id, data) => {
    const usuario = await obtenerUsuarioActivo();

    const payload = { fecha_actualizacion: new Date().toISOString() };
    if (data.descripcion !== undefined) payload.descripcion = data.descripcion.trim().toUpperCase();
    if (data.monto !== undefined) {
        validarMonto(data.monto);
        payload.monto = Number(data.monto);
    }
    if (data.categoria_id  !== undefined) payload.categoria_id  = data.categoria_id  || null;
    if (data.dia_estimado  !== undefined) payload.dia_estimado  = data.dia_estimado  || null;
    if (data.activo        !== undefined) payload.activo        = data.activo;
    if (data.fecha_fin     !== undefined) payload.fecha_fin     = data.fecha_fin     || null;

    const { data: updated, error } = await supabase
        .from('ingresos_recurrentes')
        .update(payload)
        .eq('id', id)
        .eq('user_id', usuario.id)
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .single();

    if (error) {
        console.error('❌ Error en updateRecurringIncome:', error);
        throw error;
    }

    return updated;
};

/**
 * Elimina un ingreso recurrente. Solo elimina si no tiene ingresos generados asociados;
 * si los tiene, desactiva (activo = false) para preservar el historial.
 *
 * @param {number} id
 */
export const deleteRecurringIncome = async (id) => {
    const usuario = await obtenerUsuarioActivo();

    // Verificar si tiene ingresos reales generados por este recurrente
    const { count, error: errCount } = await supabase
        .from('ingresos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', usuario.id)
        .eq('recurrente_id', id);

    if (errCount) {
        console.error('❌ Error al verificar historial de ingreso recurrente:', errCount);
        throw errCount;
    }

    if (count > 0) {
        // Tiene historial — desactivar en vez de borrar
        return updateRecurringIncome(id, { activo: false, fecha_fin: new Date().toISOString().split('T')[0] });
    }

    const { error } = await supabase
        .from('ingresos_recurrentes')
        .delete()
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) {
        console.error('❌ Error en deleteRecurringIncome:', error);
        throw error;
    }
};

/**
 * Proyecta los ingresos esperados para un mes/año dado, basándose en los
 * ingresos recurrentes activos cuya fecha_inicio sea <= ese mes.
 * No cuenta recurrentes cuya fecha_fin sea anterior al período solicitado.
 * Diferencia la proyección de ingresos reales ya registrados.
 *
 * @param {number} year
 * @param {number} month
 * @returns {{ proyectados: Array, totalProyectado: number, totalReal: number, totalCombinado: number }}
 */
export const getProjectedIncomeByMonth = async (year, month) => {
    const mesStr     = String(month).padStart(2, '0');
    const periodoStr = `${year}-${mesStr}-01`;
    const { desde: hasta } = calcularMesSiguiente(year, month);

    const [recurrentes, ingresosReales] = await Promise.all([
        getRecurringIncomes(),
        getIncomesByMonth(year, month),
    ]);

    // Filtrar recurrentes que aplican para el período solicitado
    const proyectados = recurrentes.filter(r => {
        if (!r.activo) return false;
        if (r.fecha_inicio > hasta) return false;                          // aún no empezó
        if (r.fecha_fin && r.fecha_fin < periodoStr) return false;         // ya terminó
        return true;
    }).map(r => ({
        id:           r.id,
        descripcion:  r.descripcion,
        monto:        parseFloat(r.monto),
        categoria:    r.categorias_ingresos?.nombre ?? null,
        dia_estimado: r.dia_estimado,
        origen:       'proyectado',
    }));

    const totalProyectado = proyectados.reduce((s, r) => s + r.monto, 0);
    const totalReal       = ingresosReales.reduce((s, i) => s + parseFloat(i.monto || 0), 0);

    return {
        proyectados,
        totalProyectado,
        totalReal,
        // Total combinado: real + lo que falta de la proyección (no duplica lo ya cobrado)
        totalCombinado: totalReal + Math.max(0, totalProyectado - totalReal),
    };
};
