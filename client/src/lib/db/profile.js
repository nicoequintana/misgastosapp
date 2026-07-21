import { supabase } from '../supabase';
import { obtenerUsuarioActivo } from './_helpers';

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
