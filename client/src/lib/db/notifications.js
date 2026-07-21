import { supabase } from '../supabase';
import { obtenerUsuarioActivo } from './_helpers';

// ==================== NOTIFICACIONES ====================

/**
 * Obtiene las notificaciones del usuario autenticado.
 * Ordena por fecha descendente y limita a las últimas 50.
 */
export const getNotificaciones = async () => {
    const usuario = await obtenerUsuarioActivo();
    const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .eq('user_id', usuario.id)
        .order('fecha_creacion', { ascending: false })
        .limit(50);

    if (error) throw error;
    return data || [];
};

/**
 * Crea una nueva notificación para el usuario autenticado.
 *
 * @param {Object} notificacion - { titulo, mensaje, tipo, origen, metadata }
 * @returns {Object} La notificación creada
 */
export const createNotificacion = async (notificacion) => {
    const usuario = await obtenerUsuarioActivo();
    const { data, error } = await supabase
        .from('notificaciones')
        .insert([{
            user_id:       usuario.id,
            titulo:        notificacion.titulo,
            mensaje:       notificacion.mensaje,
            tipo:          notificacion.tipo || 'info',
            origen:        notificacion.origen || 'app',
            metadata:      notificacion.metadata || null,
            leida:         false,
            email_enviado: false,
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Marca una notificación específica como leída.
 *
 * @param {number} id - ID de la notificación
 */
export const marcarLeida = async (id) => {
    const usuario = await obtenerUsuarioActivo();
    const { error } = await supabase
        .from('notificaciones')
        .update({ leida: true })
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) throw error;
};

/**
 * Marca todas las notificaciones del usuario como leídas.
 */
export const marcarTodasLeidas = async () => {
    const usuario = await obtenerUsuarioActivo();
    const { error } = await supabase
        .from('notificaciones')
        .update({ leida: true })
        .eq('user_id', usuario.id)
        .eq('leida', false);

    if (error) throw error;
};

/**
 * Actualiza el campo email_enviado y email_error de una notificación.
 * Se llama después de intentar el envío por email desde el backend.
 *
 * @param {number} id - ID de la notificación
 * @param {boolean} enviado
 * @param {string|null} errorMsg
 */
export const actualizarEstadoEmail = async (id, enviado, errorMsg = null) => {
    const usuario = await obtenerUsuarioActivo();
    const { error } = await supabase
        .from('notificaciones')
        .update({ email_enviado: enviado, email_error: errorMsg })
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) throw error;
};

// ==================== CONFIGURACIÓN DE NOTIFICACIONES ====================

/**
 * Obtiene la configuración de notificaciones del usuario.
 * Si no existe, retorna null (el contexto usará defaults).
 */
export const getConfigNotificaciones = async () => {
    const usuario = await obtenerUsuarioActivo();
    const { data, error } = await supabase
        .from('configuracion_notificaciones')
        .select('*')
        .eq('user_id', usuario.id)
        .maybeSingle();

    if (error) throw error;
    return data;
};

/**
 * Guarda o actualiza la configuración de notificaciones del usuario (upsert).
 *
 * @param {Object} config - Campos a actualizar
 * @returns {Object} La configuración guardada
 */
export const saveConfigNotificaciones = async (config) => {
    const usuario = await obtenerUsuarioActivo();
    const { data, error } = await supabase
        .from('configuracion_notificaciones')
        .upsert(
            { ...config, user_id: usuario.id, fecha_actualizacion: new Date().toISOString() },
            { onConflict: 'user_id' }
        )
        .select()
        .single();

    if (error) throw error;
    return data;
};
