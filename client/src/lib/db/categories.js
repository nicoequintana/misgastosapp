import { supabase } from '../supabase';
import { obtenerUsuarioActivo } from './_helpers';

// ==================== CATEGORÍAS ====================

/**
 * Obtiene las categorías visibles para el usuario:
 * - Categorías globales (user_id IS NULL)
 * - Categorías propias del usuario autenticado
 * Las RLS de Supabase se encargan del filtro — esta consulta trae todo lo permitido.
 *
 * @returns {Array} Lista de categorías ordenadas alfabéticamente, con flag `es_propia`
 */
export const getCategories = async () => {
    const usuario = await obtenerUsuarioActivo();

    // Validamos que el ID sea un UUID antes de interpolarlo en el filtro PostgREST.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuario.id)) {
        throw new Error('ID de usuario inválido');
    }

    // Traemos globales (user_id IS NULL) y propias del usuario autenticado
    const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .or(`user_id.is.null,user_id.eq.${usuario.id}`)
        .order('nombre');

    if (error) throw error;

    // Marcamos cuáles son propias del usuario para que la UI pueda mostrar opciones de borrado
    return (data ?? []).map(cat => ({
        ...cat,
        es_propia: cat.user_id === usuario.id,
    }));
};

/**
 * Crea una nueva categoría personal para el usuario autenticado.
 * Las categorías personales son visibles solo para ese usuario.
 *
 * @param {string} nombre - Nombre de la categoría (se normaliza a mayúsculas)
 * @param {string} [icono='label'] - Nombre del ícono Material Symbols
 * @returns {Object} La categoría creada
 * @throws {Error} Si el nombre está vacío o ya existe una categoría con ese nombre
 */
export const createCategory = async (nombre, icono = 'label') => {
    const usuario = await obtenerUsuarioActivo();

    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre de la categoría no puede estar vacío');
    }

    const nombreNormalizado = nombre.trim().toUpperCase();

    const { data, error } = await supabase
        .from('categorias')
        .insert([{ nombre: nombreNormalizado, user_id: usuario.id, icono }])
        .select()
        .single();

    if (error) {
        console.error('❌ Error en createCategory:', error);
        throw error;
    }

    return { ...data, es_propia: true };
};

/**
 * Elimina una categoría personal del usuario autenticado.
 * Solo se pueden eliminar categorías propias (user_id = auth.uid()).
 * Las RLS impiden eliminar categorías globales o de otros usuarios.
 *
 * @param {number} id - ID de la categoría a eliminar
 * @throws {Error} Si la categoría tiene gastos asociados (FK constraint) o no es propia
 */
export const deleteCategory = async (id) => {
    const usuario = await obtenerUsuarioActivo();

    const { error } = await supabase
        .from('categorias')
        .delete()
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) {
        console.error('❌ Error en deleteCategory:', error);
        throw error;
    }
};

/**
 * Obtiene los métodos de pago visibles para el usuario:
 * - Globales (user_id IS NULL)
 * - Propios del usuario autenticado
 *
 * @returns {Array} Lista de métodos de pago ordenados alfabéticamente, con flag `es_propio`
 */
export const getPaymentMethods = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('metodos_pago')
        .select('*')
        .or(`user_id.is.null,user_id.eq.${usuario.id}`)
        .order('nombre');

    if (error) throw error;
    return (data ?? []).map(pm => ({
        ...pm,
        es_propio: pm.user_id === usuario.id,
    }));
};

/**
 * Crea un método de pago personal para el usuario autenticado.
 *
 * @param {Object} metodo
 * @param {string} metodo.nombre
 * @param {string} [metodo.icono='payments']
 * @param {boolean} [metodo.acepta_cuotas=false]
 * @returns {Object} El método de pago creado
 */
export const createPaymentMethod = async ({ nombre, icono = 'payments', acepta_cuotas = false }) => {
    const usuario = await obtenerUsuarioActivo();

    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre del método de pago no puede estar vacío');
    }

    const { data, error } = await supabase
        .from('metodos_pago')
        .insert([{
            nombre: nombre.trim().toUpperCase(),
            icono,
            acepta_cuotas: Boolean(acepta_cuotas),
            user_id: usuario.id,
            activo: true,
        }])
        .select()
        .single();

    if (error) {
        console.error('❌ Error en createPaymentMethod:', error);
        throw error;
    }
    return { ...data, es_propio: true };
};

/**
 * Elimina un método de pago propio del usuario autenticado.
 * Solo se pueden eliminar métodos propios (user_id = auth.uid()).
 *
 * @param {number} id
 * @throws {Error} Si el método tiene gastos asociados (FK constraint) o no es propio
 */
export const deletePaymentMethod = async (id) => {
    const usuario = await obtenerUsuarioActivo();

    const { error } = await supabase
        .from('metodos_pago')
        .delete()
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) {
        console.error('❌ Error en deletePaymentMethod:', error);
        throw error;
    }
};
