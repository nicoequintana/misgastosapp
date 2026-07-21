import { supabase } from '../../supabase';
import { obtenerUsuarioActivo, BACKEND_URL } from '../_helpers';

// ==================== GRUPOS DE GASTOS COMPARTIDOS ====================
// --- 2.1 Grupos (CRUD) ---

/**
 * Crea un nuevo grupo de gastos compartidos.
 * El trigger grupos_alta_admin_creador agrega al creador como admin automáticamente.
 *
 * @param {Object} params
 * @param {string} params.nombre - Nombre del grupo (requerido)
 * @param {string} [params.descripcion] - Descripción opcional
 * @param {string} [params.moneda='ARS'] - Moneda del grupo
 * @returns {Object} El grupo creado
 */
export const crearGrupo = async ({ nombre, descripcion, moneda = 'ARS' }) => {
    await obtenerUsuarioActivo();

    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre del grupo no puede estar vacío');
    }
    if (nombre.trim().length > 120) {
        throw new Error('El nombre del grupo no puede superar los 120 caracteres');
    }

    const { data: grupoId, error: errorRpc } = await supabase.rpc('crear_grupo_gasto_compartido', {
        p_nombre: nombre.trim(),
        p_descripcion: descripcion?.trim() || null,
        p_moneda: moneda,
    });

    if (errorRpc) throw new Error(errorRpc.message);

    const { data, error } = await supabase
        .from('grupos_gastos')
        .select('*')
        .eq('id', grupoId)
        .single();

    if (error) {
        return {
            id: grupoId,
            nombre: nombre.trim(),
            descripcion: descripcion?.trim() || null,
            moneda,
        };
    }

    return data;
};

/**
 * Obtiene todos los grupos donde el usuario autenticado es miembro activo.
 * Hace JOIN con grupo_miembros para respetar la política de membresía.
 *
 * @returns {Array} Lista de grupos ordenados por fecha de creación descendente
 */
export const obtenerGruposDelUsuario = async () => {
    const usuario = await obtenerUsuarioActivo();

    // Primero obtenemos los IDs de grupos donde el usuario es miembro activo
    const { data: membresias, error: errMem } = await supabase
        .from('grupo_miembros')
        .select('grupo_id')
        .eq('user_id', usuario.id)
        .eq('estado', 'activo');

    if (errMem) throw new Error(errMem.message);
    if (!membresias || membresias.length === 0) return [];

    const grupoIds = membresias.map(m => m.grupo_id);

    const { data, error } = await supabase
        .from('grupos_gastos')
        .select('*')
        .in('id', grupoIds)
        .order('fecha_creacion', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
};

/**
 * Obtiene un grupo por su ID con la lista básica de miembros activos.
 * Solo accesible si el usuario es miembro activo (RLS lo valida).
 *
 * @param {number} grupoId - ID del grupo
 * @returns {Object} El grupo con sus miembros activos
 */
export const obtenerGrupoPorId = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { data, error } = await supabase
        .from('grupos_gastos')
        .select('*')
        .eq('id', grupoId)
        .single();

    if (error) throw new Error(error.message);
    return data;
};

// --- 2.2 Miembros ---

/**
 * Obtiene los miembros activos de un grupo.
 * No hace JOIN a auth.users porque el anon key no tiene acceso a esa tabla.
 * Retorna solo los campos de grupo_miembros.
 *
 * @param {number} grupoId - ID del grupo
 * @returns {Array} Lista de miembros activos con user_id, rol, alias, estado, fecha_alta
 */
export const obtenerMiembrosDelGrupo = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { data, error } = await supabase
        .from('grupo_miembros')
        .select('id, grupo_id, user_id, rol, estado, alias, fecha_alta')
        .eq('grupo_id', grupoId)
        .eq('estado', 'activo')
        .order('fecha_alta', { ascending: true });

    if (error) throw new Error(error.message);

    const miembros = data ?? [];

    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return miembros;

        const response = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/miembros/perfiles`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) return miembros;

        const payload = await response.json();
        if (!payload?.ok || !Array.isArray(payload.perfiles)) return miembros;

        const perfilesMap = new Map(payload.perfiles.map((p) => [p.user_id, p]));

        return miembros.map((m) => {
            const perfil = perfilesMap.get(m.user_id);
            const nombre = perfil?.nombre?.trim();
            return {
                ...m,
                nombre: nombre || m.alias || 'Usuario sin nombre',
                alias: m.alias || nombre || 'Usuario sin nombre',
                email: perfil?.email || null,
            };
        });
    } catch {
        // Si falla el enriquecimiento, devolvemos los miembros base sin bloquear la pantalla.
        return miembros;
    }
};

/**
 * Remueve un miembro del grupo (soft delete: estado='removido').
 * Solo el admin puede remover miembros (RLS lo valida).
 *
 * @param {number} grupoId - ID del grupo
 * @param {string} userId - UUID del miembro a remover
 */
export const removerMiembro = async (grupoId, userId) => {
    if (!grupoId || !userId) throw new Error('grupoId y userId son requeridos');

    const { error } = await supabase
        .from('grupo_miembros')
        .update({ estado: 'removido', fecha_baja: new Date().toISOString() })
        .eq('grupo_id', grupoId)
        .eq('user_id', userId)
        .eq('estado', 'activo');

    if (error) throw new Error(error.message);
};

// --- 2.3 Invitaciones (lectura/cancelación via Supabase; creación/aceptación via backend) ---

/**
 * Obtiene las invitaciones pendientes de un grupo.
 * Solo accesible para el admin del grupo (RLS lo valida).
 *
 * @param {number} grupoId - ID del grupo
 * @returns {Array} Lista de invitaciones con estado='pendiente'
 */
export const obtenerInvitacionesPendientes = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const ahora = new Date().toISOString();

    // Marcamos como expirada cualquier invitación vencida antes de listar.
    // Así la UI nunca muestra pendientes ya caducadas.
    const { error: errorExpirar } = await supabase
        .from('grupo_invitaciones')
        .update({ estado: 'expirada', fecha_resolucion: ahora })
        .eq('grupo_id', grupoId)
        .eq('estado', 'pendiente')
        .lt('fecha_expiracion', ahora);

    if (errorExpirar) throw new Error(errorExpirar.message);

    const { data, error } = await supabase
        .from('grupo_invitaciones')
        .select('id, grupo_id, email_invitado, estado, fecha_expiracion, fecha_creacion')
        .eq('grupo_id', grupoId)
        .eq('estado', 'pendiente')
        .order('fecha_creacion', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
};

/**
 * Cancela una invitación pendiente.
 * Solo el admin del grupo puede cancelar invitaciones (RLS lo valida).
 *
 * @param {number} invitacionId - ID de la invitación a cancelar
 */
export const cancelarInvitacion = async (invitacionId) => {
    if (!invitacionId) throw new Error('ID de invitación inválido');

    const { error } = await supabase
        .from('grupo_invitaciones')
        .update({ estado: 'cancelada', fecha_resolucion: new Date().toISOString() })
        .eq('id', invitacionId)
        .eq('estado', 'pendiente');

    if (error) throw new Error(error.message);
};
