const { supabaseAdmin } = require('./supabaseAdmin');

/**
 * Persiste una notificación en Supabase usando el cliente admin (service role).
 * Se usa cuando la notificación es generada por el backend (n8n, sistema)
 * y no hay un usuario de frontend que pueda escribir directamente.
 *
 * @param {string} userId - UUID del usuario destinatario
 * @param {Object} notificacion - { titulo, mensaje, tipo, origen, metadata }
 * @returns {Promise<Object|null>} La notificación creada, o null si falló
 */
const persistirNotificacion = async (userId, notificacion) => {
    if (!userId || !notificacion?.titulo) return null;

    try {
        const { data, error } = await supabaseAdmin
            .from('notificaciones')
            .insert([{
                user_id:       userId,
                titulo:        notificacion.titulo,
                mensaje:       notificacion.mensaje,
                tipo:          notificacion.tipo    || 'info',
                origen:        notificacion.origen  || 'sistema',
                metadata:      notificacion.metadata || null,
                leida:         false,
                email_enviado: false,
            }])
            .select()
            .single();

        if (error) {
            console.error('❌ Error al persistir notificación:', error.message);
            return null;
        }

        return data;
    } catch (err) {
        console.error('❌ Error inesperado al persistir notificación:', err.message);
        return null;
    }
};

/**
 * Actualiza el estado del email en una notificación ya persistida.
 *
 * @param {number} notificacionId
 * @param {boolean} enviado
 * @param {string|null} errorMsg
 */
const actualizarEstadoEmailDb = async (notificacionId, enviado, errorMsg = null) => {
    if (!notificacionId) return;

    const { error } = await supabaseAdmin
        .from('notificaciones')
        .update({ email_enviado: enviado, email_error: errorMsg })
        .eq('id', notificacionId);

    if (error) console.warn('⚠️ No se pudo actualizar estado email:', error.message);
};

/**
 * Obtiene la configuración de notificaciones de un usuario.
 * Retorna null si el usuario no tiene configuración guardada.
 *
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
const getConfigUsuario = async (userId) => {
    if (!userId) return null;

    const { data, error } = await supabaseAdmin
        .from('configuracion_notificaciones')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.warn('⚠️ No se pudo obtener config de notificaciones:', error.message);
        return null;
    }

    return data;
};

module.exports = { persistirNotificacion, actualizarEstadoEmailDb, getConfigUsuario };
