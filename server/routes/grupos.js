const express = require('express');
const { supabaseAdmin: supabaseAdminSingleton } = require('../services/supabaseAdmin');
const { enviarEmailInvitacionGrupo, enviarEmailInvitacionRegistro } = require('../services/email');
const { persistirNotificacion, actualizarEstadoEmailDb, getConfigUsuario } = require('../services/notificacionesDb');
const { procesarEnvioEmail, buildNotificacionGrupo } = require('../services/notificaciones');

const router = express.Router();

// ───────────────────────────────────────────────
// Rate limit in-memory por grupo (MVP — se resetea al reiniciar)
// Máximo 10 invitaciones por grupo por hora.
// ───────────────────────────────────────────────
const rateLimitMap = new Map(); // { grupoId: { count, resetAt } }
const RATE_LIMIT_MAX      = 10;
const RATE_LIMIT_VENTANA  = 60 * 60 * 1000; // 1 hora en ms
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nombreDesdeAuthUser = (authUser) => {
    if (!authUser) return null;
    const metadata = authUser.user_metadata || {};
    const nombre = metadata.full_name || metadata.name || null;
    if (nombre && String(nombre).trim()) return String(nombre).trim();
    if (authUser.email && String(authUser.email).includes('@')) {
        return String(authUser.email).split('@')[0];
    }
    return null;
};

const buscarUsuarioPorEmail = async (supabaseAdmin, email) => {
    const emailBuscado = (email || '').toLowerCase().trim();
    if (!emailBuscado) return null;

    let page = 1;
    const perPage = 200;

    while (page <= 10) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;

        const usuarios = data?.users || [];
        const encontrado = usuarios.find((u) => (u.email || '').toLowerCase() === emailBuscado);
        if (encontrado) return encontrado;

        if (usuarios.length < perPage) break;
        page += 1;
    }

    return null;
};

const validarAdminGrupo = async (supabaseAdmin, grupoId, userId) => {
    const { data: membresia, error } = await supabaseAdmin
        .from('grupo_miembros')
        .select('id, rol')
        .eq('grupo_id', grupoId)
        .eq('user_id', userId)
        .eq('estado', 'activo')
        .maybeSingle();

    if (error) {
        throw new Error('Error al verificar permisos');
    }

    return !!(membresia && membresia.rol === 'admin');
};

/**
 * Verifica y actualiza el rate limit para un grupo.
 * Retorna true si el límite fue superado, false si el request puede continuar.
 *
 * @param {string|number} grupoId
 */
const superaRateLimit = (grupoId) => {
    const ahora = Date.now();
    const key   = String(grupoId);
    const entry = rateLimitMap.get(key);

    if (!entry || ahora >= entry.resetAt) {
        // Primera invitación o ventana expirada — reiniciar contador
        rateLimitMap.set(key, { count: 1, resetAt: ahora + RATE_LIMIT_VENTANA });
        return false;
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        // Límite superado
        return true;
    }

    // Incrementar contador
    entry.count += 1;
    return false;
};

// ───────────────────────────────────────────────
// Middleware de autenticación
// Extrae el JWT del header Authorization: Bearer <token>,
// lo valida con Supabase service role y adjunta req.user y req.supabaseAdmin.
// ───────────────────────────────────────────────
const requireAuth = async (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
        return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    try {
        const { data: { user }, error } = await supabaseAdminSingleton.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ ok: false, error: 'Token inválido o sesión expirada' });
        }

        req.user          = user;
        req.supabaseAdmin = supabaseAdminSingleton;
        next();
    } catch (err) {
        console.error('❌ Error en requireAuth:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al validar sesión' });
    }
};

// ───────────────────────────────────────────────
// POST /api/grupos/:grupoId/invitaciones
// Crea una invitación y envía el email al destinatario.
// Requiere: JWT válido + ser admin del grupo.
// Body: { email: string }
// ───────────────────────────────────────────────
router.post('/:grupoId/invitaciones', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const { email: emailRaw } = req.body;

    // 1. Validar que se envió un email
    if (!emailRaw || typeof emailRaw !== 'string') {
        return res.status(400).json({ ok: false, error: 'El campo email es requerido' });
    }

    // 2. Validar formato de email
    if (!EMAIL_REGEX.test(emailRaw.trim())) {
        return res.status(400).json({ ok: false, error: 'El formato del email no es válido' });
    }

    // 3. Rate limit
    if (superaRateLimit(grupoId)) {
        return res.status(429).json({
            ok: false,
            error: 'Límite de invitaciones alcanzado. Intentá en una hora.',
        });
    }

    const email = emailRaw.trim().toLowerCase();
    const { supabaseAdmin, user } = req;

    try {
        // 4. Verificar que el usuario autenticado es admin del grupo
        const esAdmin = await validarAdminGrupo(supabaseAdmin, grupoId, user.id);
        if (!esAdmin) {
            return res.status(403).json({ ok: false, error: 'Solo los admins pueden invitar miembros' });
        }

        // 5. Verificar si ya existe una invitación pendiente para este email en el grupo
        const { data: invExistente, error: errInvExistente } = await supabaseAdmin
            .from('grupo_invitaciones')
            .select('id, email_invitado, fecha_expiracion')
            .eq('grupo_id', grupoId)
            .eq('email_invitado', email)
            .eq('estado', 'pendiente')
            .maybeSingle();

        if (errInvExistente) {
            console.error('❌ Error al verificar invitación existente:', errInvExistente.message);
            return res.status(500).json({ ok: false, error: 'Error al verificar invitaciones previas' });
        }

        if (invExistente) {
            // Idempotente: retornar la existente sin crear duplicado
            return res.status(200).json({
                ok: true,
                invitacion: {
                    id:               invExistente.id,
                    email_invitado:   invExistente.email_invitado,
                    fecha_expiracion: invExistente.fecha_expiracion,
                    email_enviado:    false,
                },
                mensaje: 'Ya existe una invitación pendiente para este email.',
            });
        }

        // 6. Verificar que el email no corresponde a un miembro activo actual
        // Buscamos en auth.users por email y luego en grupo_miembros
        const usuarioExistente = await buscarUsuarioPorEmail(supabaseAdmin, email);
        if (usuarioExistente) {
            const { data: miembroActivo } = await supabaseAdmin
                .from('grupo_miembros')
                .select('id')
                .eq('grupo_id', grupoId)
                .eq('user_id', usuarioExistente.id)
                .eq('estado', 'activo')
                .maybeSingle();

            if (miembroActivo) {
                return res.status(409).json({
                    ok: false,
                    error: 'Este email ya corresponde a un miembro activo del grupo.',
                });
            }
        }

        // 7. Obtener datos del grupo e invitador para el email
        const { data: grupo, error: errGrupo } = await supabaseAdmin
            .from('grupos_gastos')
            .select('nombre')
            .eq('id', grupoId)
            .maybeSingle();

        if (errGrupo || !grupo) {
            return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
        }

        // 8. INSERT en grupo_invitaciones — el token UUID lo genera SQL por DEFAULT
        const { data: invitacion, error: errInsert } = await supabaseAdmin
            .from('grupo_invitaciones')
            .insert({
                grupo_id:       Number(grupoId),
                email_invitado: email,
                invitado_por:   user.id,
                estado:         'pendiente',
            })
            .select('id, token, email_invitado, fecha_expiracion')
            .single();

        if (errInsert || !invitacion) {
            console.error('❌ Error al insertar invitación:', errInsert?.message);
            return res.status(500).json({ ok: false, error: 'Error al crear la invitación' });
        }

        // 9. Construir link de aceptación
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const link = `${frontendUrl}/grupos/invitaciones/${invitacion.token}`;

        // Nombre del invitador: usar email como fallback si no hay nombre en metadata
        const invitadorNombre = user.user_metadata?.full_name
            || user.user_metadata?.name
            || user.email
            || 'Un integrante';

        // 10. Enviar email (fire-and-continue: no abortamos si falla)
        const resultadoEmail = await enviarEmailInvitacionGrupo(email, {
            grupoNombre:     grupo.nombre,
            invitadorNombre,
            link,
            fechaExpiracion: invitacion.fecha_expiracion,
        });

        if (!resultadoEmail.ok) {
            // Loguear el error pero no cancelar la operación — la invitación ya fue creada
            console.error('⚠️ No se pudo enviar el email de invitación:', resultadoEmail.error);
        }

        return res.status(201).json({
            ok: true,
            invitacion: {
                id:               invitacion.id,
                email_invitado:   invitacion.email_invitado,
                fecha_expiracion: invitacion.fecha_expiracion,
                email_enviado:    resultadoEmail.ok,
            },
        });

    } catch (err) {
        console.error('❌ Error inesperado en POST /invitaciones:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al procesar la invitación' });
    }
});

// ───────────────────────────────────────────────
// GET /api/grupos/:grupoId/usuarios/buscar?email=...
// Busca si existe un usuario registrado por email y si ya es miembro activo.
// Requiere admin del grupo.
// ───────────────────────────────────────────────
router.get('/:grupoId/usuarios/buscar', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const emailRaw = String(req.query.email || '').trim();
    const email = emailRaw.toLowerCase();
    const { supabaseAdmin, user } = req;

    if (!EMAIL_REGEX.test(emailRaw)) {
        return res.status(400).json({ ok: false, error: 'El formato del email no es válido' });
    }

    try {
        const esAdmin = await validarAdminGrupo(supabaseAdmin, grupoId, user.id);
        if (!esAdmin) {
            return res.status(403).json({ ok: false, error: 'Solo los admins pueden buscar usuarios' });
        }

        const usuarioEncontrado = await buscarUsuarioPorEmail(supabaseAdmin, email);
        if (!usuarioEncontrado) {
            return res.json({ ok: true, registrado: false, email });
        }

        const { data: miembroActivo, error: errMiembro } = await supabaseAdmin
            .from('grupo_miembros')
            .select('id')
            .eq('grupo_id', grupoId)
            .eq('user_id', usuarioEncontrado.id)
            .eq('estado', 'activo')
            .maybeSingle();

        if (errMiembro) {
            console.error('❌ Error al verificar miembro activo:', errMiembro.message);
            return res.status(500).json({ ok: false, error: 'Error al validar membresía' });
        }

        return res.json({
            ok: true,
            registrado: true,
            yaEsMiembro: !!miembroActivo,
        });
    } catch (err) {
        console.error('❌ Error en GET /usuarios/buscar:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al buscar usuario' });
    }
});

// ───────────────────────────────────────────────
// GET /api/grupos/:grupoId/miembros/perfiles
// Devuelve nombres legibles para miembros activos del grupo.
// Requiere ser miembro activo.
// ───────────────────────────────────────────────
router.get('/:grupoId/miembros/perfiles', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const { supabaseAdmin, user } = req;

    try {
        const { data: soyMiembro, error: errSoyMiembro } = await supabaseAdmin
            .from('grupo_miembros')
            .select('id')
            .eq('grupo_id', grupoId)
            .eq('user_id', user.id)
            .eq('estado', 'activo')
            .maybeSingle();

        if (errSoyMiembro) {
            console.error('❌ Error al verificar acceso a perfiles:', errSoyMiembro.message);
            return res.status(500).json({ ok: false, error: 'Error al verificar acceso' });
        }

        if (!soyMiembro) {
            return res.status(403).json({ ok: false, error: 'No tenés acceso a este grupo' });
        }

        const { data: miembros, error: errMiembros } = await supabaseAdmin
            .from('grupo_miembros')
            .select('user_id, alias')
            .eq('grupo_id', grupoId)
            .eq('estado', 'activo');

        if (errMiembros) {
            console.error('❌ Error al listar miembros:', errMiembros.message);
            return res.status(500).json({ ok: false, error: 'Error al listar miembros' });
        }

        const perfiles = await Promise.all((miembros || []).map(async (m) => {
            let nombre = m.alias || null;
            let email = null;

            if (!nombre) {
                try {
                    const { data: userData, error: errUser } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
                    if (!errUser && userData?.user) {
                        nombre = nombreDesdeAuthUser(userData.user);
                        email = userData.user.email || null;
                    }
                } catch {
                    // Ignoramos error individual para no romper la lista completa.
                }
            }

            if (!nombre && email) {
                nombre = email.split('@')[0];
            }

            return {
                user_id: m.user_id,
                nombre: nombre || 'Usuario sin nombre',
            };
        }));

        return res.json({ ok: true, perfiles });
    } catch (err) {
        console.error('❌ Error en GET /miembros/perfiles:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al obtener perfiles' });
    }
});

// ───────────────────────────────────────────────
// POST /api/grupos/:grupoId/invitaciones/registro
// Envía email para registrarse en la app a un usuario no registrado.
// Requiere admin del grupo.
// Body: { email: string }
// ───────────────────────────────────────────────
router.post('/:grupoId/invitaciones/registro', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const emailRaw = String(req.body?.email || '').trim();
    const email = emailRaw.toLowerCase();
    const { supabaseAdmin, user } = req;

    if (!EMAIL_REGEX.test(emailRaw)) {
        return res.status(400).json({ ok: false, error: 'El formato del email no es válido' });
    }

    try {
        if (superaRateLimit(grupoId)) {
            return res.status(429).json({ ok: false, error: 'Límite de invitaciones alcanzado. Intentá en una hora.' });
        }

        const esAdmin = await validarAdminGrupo(supabaseAdmin, grupoId, user.id);
        if (!esAdmin) {
            return res.status(403).json({ ok: false, error: 'Solo los admins pueden invitar miembros' });
        }

        const usuarioExistente = await buscarUsuarioPorEmail(supabaseAdmin, email);
        if (usuarioExistente) {
            return res.status(409).json({ ok: false, error: 'Ese email ya está registrado. Enviá invitación al grupo directamente.' });
        }

        const { data: grupo, error: errGrupo } = await supabaseAdmin
            .from('grupos_gastos')
            .select('nombre')
            .eq('id', grupoId)
            .maybeSingle();

        if (errGrupo || !grupo) {
            return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
        }

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const linkRegistro = `${frontendUrl}/welcome`;
        const invitadorNombre = user.user_metadata?.full_name
            || user.user_metadata?.name
            || user.email
            || 'Un integrante';

        const resultadoEmail = await enviarEmailInvitacionRegistro(email, {
            grupoNombre: grupo.nombre,
            invitadorNombre,
            linkRegistro,
        });

        if (!resultadoEmail.ok) {
            return res.status(500).json({ ok: false, error: 'No se pudo enviar el email de registro' });
        }

        return res.status(201).json({ ok: true, mensaje: 'Email de registro enviado correctamente.' });
    } catch (err) {
        console.error('❌ Error en POST /invitaciones/registro:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al enviar invitación de registro' });
    }
});

// ───────────────────────────────────────────────
// POST /api/grupos/invitaciones/aceptar
// Acepta una invitación identificada por token UUID.
// Requiere: JWT válido. El email del JWT debe coincidir con email_invitado.
// Body: { token: string (UUID) }
// ───────────────────────────────────────────────
router.post('/invitaciones/aceptar', requireAuth, async (req, res) => {
    const { token } = req.body;

    // 1. Validar que se envió el token con formato UUID
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ ok: false, error: 'El campo token es requerido' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token.trim())) {
        return res.status(400).json({ ok: false, error: 'Token de invitación inválido' });
    }

    const { supabaseAdmin, user } = req;

    try {
        // 2. Buscar la invitación con service role
        const { data: invitacion, error: errBuscar } = await supabaseAdmin
            .from('grupo_invitaciones')
            .select('id, grupo_id, email_invitado, estado, fecha_expiracion')
            .eq('token', token.trim())
            .maybeSingle();

        if (errBuscar) {
            console.error('❌ Error al buscar invitación:', errBuscar.message);
            return res.status(500).json({ ok: false, error: 'Error al buscar la invitación' });
        }

        // 3. Validar que existe
        if (!invitacion) {
            return res.status(404).json({ ok: false, error: 'Invitación no encontrada' });
        }

        // 4. Validar estado pendiente
        if (invitacion.estado !== 'pendiente') {
            return res.status(410).json({
                ok: false,
                error: invitacion.estado === 'expirada'
                    ? 'Esta invitación ya venció.'
                    : 'Esta invitación ya fue resuelta.',
            });
        }

        // 5. Validar que no haya expirado
        const ahora = new Date();
        const expiracion = new Date(invitacion.fecha_expiracion);
        if (ahora >= expiracion) {
            // Marcar como expirada en background
            supabaseAdmin
                .from('grupo_invitaciones')
                .update({ estado: 'expirada', fecha_resolucion: new Date().toISOString() })
                .eq('id', invitacion.id)
                .eq('estado', 'pendiente')
                .then(() => {})
                .catch((e) => console.error('⚠️ Error al marcar expirada:', e.message));

            return res.status(410).json({ ok: false, error: 'Esta invitación ya venció.' });
        }

        // 6. Validar que el email del JWT coincide con el email invitado (case-insensitive)
        const emailUsuario     = (user.email || '').toLowerCase();
        const emailInvitado    = (invitacion.email_invitado || '').toLowerCase();

        if (emailUsuario !== emailInvitado) {
            return res.status(403).json({
                ok: false,
                error: 'Esta invitación fue enviada a otro email.',
            });
        }

        // 7. Llamar RPC transaccional con service role
        const { data: grupoIdResultado, error: errRpc } = await supabaseAdmin
            .rpc('aceptar_invitacion_grupo', {
                p_token:   token.trim(),
                p_user_id: user.id,
            });

        if (errRpc) {
            console.error('❌ Error en RPC aceptar_invitacion_grupo:', errRpc.message);
            return res.status(500).json({ ok: false, error: 'Error al aceptar la invitación' });
        }

        if (!grupoIdResultado) {
            console.error('❌ RPC no retornó grupo_id');
            return res.status(500).json({ ok: false, error: 'Error al aceptar la invitación: grupo no encontrado' });
        }

        return res.json({ ok: true, grupo_id: grupoIdResultado });

    } catch (err) {
        console.error('❌ Error inesperado en POST /invitaciones/aceptar:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al aceptar la invitación' });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/grupos/:grupoId — Elimina un grupo
// Solo admins. Solo si todos los saldos son cero.
// ─────────────────────────────────────────────
router.delete('/:grupoId', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const userId = req.user.id;
    const supabaseAdmin = req.supabaseAdmin;

    try {
        // Verificar que el solicitante es miembro activo del grupo
        const { data: membresia, error: errMembresia } = await supabaseAdmin
            .from('grupo_miembros')
            .select('id')
            .eq('grupo_id', grupoId)
            .eq('user_id', userId)
            .eq('estado', 'activo')
            .maybeSingle();

        if (errMembresia) {
            console.error('❌ Error al verificar membresía:', errMembresia.message);
            return res.status(500).json({ ok: false, error: 'Error al verificar membresía' });
        }

        if (!membresia) {
            return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });
        }

        // Solo admins pueden eliminar el grupo
        const esAdmin = await validarAdminGrupo(supabaseAdmin, grupoId, userId);
        if (!esAdmin) {
            return res.status(403).json({ ok: false, error: 'Solo los admins pueden eliminar el grupo' });
        }

        // Obtener datos del grupo y miembros activos antes de eliminar
        const [{ data: grupo, error: errGrupo }, { data: miembros, error: errMiembros }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('id, nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.from('grupo_miembros').select('user_id').eq('grupo_id', grupoId).eq('estado', 'activo'),
        ]);

        if (errGrupo || errMiembros) {
            console.error('❌ Error al obtener datos del grupo:', errGrupo?.message || errMiembros?.message);
            return res.status(500).json({ ok: false, error: 'Error al obtener datos del grupo' });
        }

        // Verificar que todos los saldos netos son cero
        const { data: saldos, error: errSaldos } = await supabaseAdmin
            .from('vw_grupo_saldos')
            .select('user_id, saldo_neto')
            .eq('grupo_id', grupoId);

        if (errSaldos) {
            console.error('❌ Error al consultar saldos:', errSaldos.message);
            return res.status(500).json({ ok: false, error: 'Error al verificar saldos del grupo' });
        }

        const saldosPendientes = (saldos || []).filter((s) => Math.abs(s.saldo_neto) > 0.01);
        if (saldosPendientes.length > 0) {
            return res.status(422).json({
                ok: false,
                error: 'No se puede eliminar el grupo porque hay saldos pendientes. Liquidá todas las deudas antes de eliminar.',
            });
        }

        // Obtener nombre del usuario que elimina para la notificación
        let nombreEliminador = null;
        try {
            const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
            nombreEliminador = nombreDesdeAuthUser(authData?.user) || req.user.email?.split('@')[0] || 'Un miembro';
        } catch {
            nombreEliminador = 'Un miembro';
        }

        // Eliminar el grupo — FK CASCADE elimina miembros, gastos, invitaciones
        const { error: errDel } = await supabaseAdmin
            .from('grupos_gastos')
            .delete()
            .eq('id', grupoId);

        if (errDel) {
            console.error('❌ Error al eliminar grupo:', errDel.message);
            return res.status(500).json({ ok: false, error: 'No se pudo eliminar el grupo' });
        }

        // Notificar a todos los miembros — fire-and-forget, nunca interrumpe la respuesta
        const nombreGrupo = grupo?.nombre || 'Grupo eliminado';
        const notificacion = {
            titulo:  'Grupo eliminado',
            mensaje: `El grupo "${nombreGrupo}" fue eliminado por ${nombreEliminador}.`,
            tipo:    'warning',
            origen:  'grupos',
            metadata: { grupo: nombreGrupo, eliminado_por: nombreEliminador },
        };

        Promise.allSettled((miembros || []).map(async (m) => {
            const creada = await persistirNotificacion(m.user_id, notificacion);
            if (!creada) return;

            try {
                const { data: authData } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
                const emailMiembro = authData?.user?.email || null;
                if (!emailMiembro) return;

                const config = await getConfigUsuario(m.user_id);
                if (!config?.email_habilitado) return;

                const { emailEnviado, emailError } = await procesarEnvioEmail(emailMiembro, creada, config);
                await actualizarEstadoEmailDb(creada.id, emailEnviado, emailError || null);
            } catch (err) {
                console.error(`❌ Error al notificar miembro ${m.user_id}:`, err.message);
            }
        })).catch(() => {});

        return res.json({ ok: true });

    } catch (err) {
        console.error('❌ Error en DELETE /grupos/:grupoId:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al eliminar el grupo' });
    }
});

// ───────────────────────────────────────────────
// Helper: notifica a todos los miembros activos de un grupo (fire-and-forget)
// ───────────────────────────────────────────────
const notificarMiembros = (supabaseAdmin, grupoId, notificacion, excluirUserId = null) => {
    Promise.resolve().then(async () => {
        try {
            const { data: miembros } = await supabaseAdmin
                .from('grupo_miembros')
                .select('user_id')
                .eq('grupo_id', grupoId)
                .eq('estado', 'activo');

            await Promise.allSettled((miembros || [])
                .filter((m) => m.user_id !== excluirUserId)
                .map(async (m) => {
                    const creada = await persistirNotificacion(m.user_id, notificacion);
                    if (!creada) return;

                    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
                    const emailMiembro = authData?.user?.email || null;
                    if (!emailMiembro) return;

                    const config = await getConfigUsuario(m.user_id);
                    const { emailEnviado, emailError } = await procesarEnvioEmail(emailMiembro, creada, config);
                    await actualizarEstadoEmailDb(creada.id, emailEnviado, emailError || null);
                })
            );
        } catch (err) {
            console.error('❌ Error en notificarMiembros:', err.message);
        }
    });
};

// ───────────────────────────────────────────────
// Helpers de cálculo de división igualitaria
// ───────────────────────────────────────────────
const calcularParticipantes = (gastoId, montoNum, pagadoPor, participantesUnicos) => {
    const n = participantesUnicos.length;
    const base = Math.floor((montoNum / n) * 100) / 100;
    const diferencia = Math.round((montoNum - base * n) * 100) / 100;
    const indexAjuste = participantesUnicos.indexOf(pagadoPor) !== -1
        ? participantesUnicos.indexOf(pagadoPor)
        : 0;

    return participantesUnicos.map((uid, idx) => ({
        gasto_id: gastoId,
        user_id: uid,
        monto_asignado: idx === indexAjuste
            ? Math.round((base + diferencia) * 100) / 100
            : base,
    }));
};

// ─────────────────────────────────────────────
// POST /api/grupos/:grupoId/gastos — Crea un gasto grupal
// ─────────────────────────────────────────────
router.post('/:grupoId/gastos', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const { supabaseAdmin, user } = req;
    const { descripcion, monto, pagadoPor, fecha, nota, idCategoria, participantesUserIds } = req.body;

    if (!descripcion?.trim()) return res.status(400).json({ ok: false, error: 'La descripción es requerida' });
    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });
    if (!pagadoPor) return res.status(400).json({ ok: false, error: 'El pagador es requerido' });
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        return res.status(400).json({ ok: false, error: 'Se requiere al menos un participante' });
    }

    try {
        // Verificar membresía activa
        const { data: membresia } = await supabaseAdmin
            .from('grupo_miembros').select('id')
            .eq('grupo_id', grupoId).eq('user_id', user.id).eq('estado', 'activo').maybeSingle();
        if (!membresia) return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });

        const participantesUnicos = [...new Set(participantesUserIds)];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (participantesUnicos.some(id => !uuidRegex.test(id))) {
            return res.status(400).json({ ok: false, error: 'participantesUserIds contiene IDs inválidos' });
        }
        if (!uuidRegex.test(pagadoPor)) {
            return res.status(400).json({ ok: false, error: 'pagadoPor contiene un ID inválido' });
        }

        // Verificar que todos los participantes y el pagador son miembros activos del grupo
        const idsAValidar = [...new Set([...participantesUnicos, pagadoPor])];
        const { data: miembrosActivos } = await supabaseAdmin
            .from('grupo_miembros').select('user_id')
            .eq('grupo_id', grupoId).eq('estado', 'activo').in('user_id', idsAValidar);
        const idsValidos = new Set((miembrosActivos || []).map(m => m.user_id));
        if (!idsValidos.has(pagadoPor)) {
            return res.status(400).json({ ok: false, error: 'El pagador no es miembro activo del grupo' });
        }
        const noMiembros = participantesUnicos.filter(id => !idsValidos.has(id));
        if (noMiembros.length > 0) {
            return res.status(400).json({ ok: false, error: 'Algunos participantes no son miembros activos del grupo' });
        }

        const { data: gasto, error: errGasto } = await supabaseAdmin
            .from('grupo_gastos')
            .insert([{
                grupo_id:     Number(grupoId),
                descripcion:  descripcion.trim().toUpperCase(),
                monto:        montoNum,
                pagado_por:   pagadoPor,
                fecha:        fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }),
                nota:         nota?.trim() || null,
                id_categoria: idCategoria || null,
                creado_por:   user.id,
            }])
            .select()
            .single();

        if (errGasto) {
            console.error('❌ Error al crear gasto grupal:', errGasto.message);
            return res.status(500).json({ ok: false, error: 'Error al crear el gasto' });
        }

        const filas = calcularParticipantes(gasto.id, montoNum, pagadoPor, participantesUnicos);
        const { data: participantes, error: errPart } = await supabaseAdmin
            .from('grupo_gasto_participantes').insert(filas).select();

        if (errPart) {
            // Rollback: anular el gasto huérfano
            await supabaseAdmin.from('grupo_gastos')
                .update({ estado: 'anulado', anulado_en: new Date().toISOString(), anulado_por: user.id })
                .eq('id', gasto.id);
            console.error('❌ Error al insertar participantes (POST /gastos):', errPart.message);
            return res.status(500).json({ ok: false, error: 'Error al registrar participantes' });
        }

        // Obtener datos del grupo y nombre del actor para notificación
        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('gasto_creado', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            descripcion: gasto.descripcion,
            monto:       gasto.monto,
        }), user.id);

        return res.status(201).json({ ok: true, gasto, participantes });
    } catch (err) {
        console.error('❌ Error en POST /gastos:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al crear el gasto' });
    }
});

// ─────────────────────────────────────────────
// PUT /api/grupos/:grupoId/gastos/:gastoId — Edita un gasto grupal
// ─────────────────────────────────────────────
router.put('/:grupoId/gastos/:gastoId', requireAuth, async (req, res) => {
    const { grupoId, gastoId } = req.params;
    const { supabaseAdmin, user } = req;
    const { descripcion, monto, pagadoPor, fecha, nota, idCategoria, participantesUserIds } = req.body;

    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        return res.status(400).json({ ok: false, error: 'Se requiere al menos un participante' });
    }
    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });

    try {
        // Solo quien pagó puede editar
        const { data: gastoActual } = await supabaseAdmin
            .from('grupo_gastos').select('id, pagado_por, descripcion, monto')
            .eq('id', gastoId).eq('grupo_id', grupoId).eq('estado', 'activo').maybeSingle();
        if (!gastoActual) return res.status(404).json({ ok: false, error: 'Gasto no encontrado o ya anulado' });
        if (gastoActual.pagado_por !== user.id) return res.status(403).json({ ok: false, error: 'Solo quien pagó el gasto puede editarlo' });

        const participantesUnicos = [...new Set(participantesUserIds)];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (participantesUnicos.some(id => !uuidRegex.test(id))) {
            return res.status(400).json({ ok: false, error: 'participantesUserIds contiene IDs inválidos' });
        }
        if (!uuidRegex.test(pagadoPor)) {
            return res.status(400).json({ ok: false, error: 'pagadoPor contiene un ID inválido' });
        }

        // Verificar que todos los participantes y el pagador son miembros activos del grupo
        const idsAValidarPut = [...new Set([...participantesUnicos, pagadoPor])];
        const { data: miembrosActivosPut } = await supabaseAdmin
            .from('grupo_miembros').select('user_id')
            .eq('grupo_id', grupoId).eq('estado', 'activo').in('user_id', idsAValidarPut);
        const idsValidosPut = new Set((miembrosActivosPut || []).map(m => m.user_id));
        if (!idsValidosPut.has(pagadoPor)) {
            return res.status(400).json({ ok: false, error: 'El pagador no es miembro activo del grupo' });
        }
        const noMiembrosPut = participantesUnicos.filter(id => !idsValidosPut.has(id));
        if (noMiembrosPut.length > 0) {
            return res.status(400).json({ ok: false, error: 'Algunos participantes no son miembros activos del grupo' });
        }

        const { data: gasto, error: errUpdate } = await supabaseAdmin
            .from('grupo_gastos')
            .update({
                descripcion:  descripcion.trim().toUpperCase(),
                monto:        montoNum,
                pagado_por:   pagadoPor,
                fecha:        fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }),
                nota:         nota?.trim() || null,
                id_categoria: idCategoria || null,
            })
            .eq('id', gastoId)
            .eq('estado', 'activo')
            .select()
            .maybeSingle();

        if (errUpdate) {
            console.error('❌ Error al actualizar gasto (PUT /gastos):', errUpdate.message);
            return res.status(500).json({ ok: false, error: 'Error al actualizar el gasto' });
        }
        if (!gasto) return res.status(404).json({ ok: false, error: 'El gasto no existe o ya fue anulado' });

        const { error: errDel } = await supabaseAdmin
            .from('grupo_gasto_participantes').delete().eq('gasto_id', gastoId);
        if (errDel) {
            console.error('❌ Error al limpiar participantes (PUT /gastos):', errDel.message);
            return res.status(500).json({ ok: false, error: 'Error al limpiar participantes' });
        }

        const filas = calcularParticipantes(gasto.id, montoNum, pagadoPor, participantesUnicos);
        const { data: participantes, error: errPart } = await supabaseAdmin
            .from('grupo_gasto_participantes').insert(filas).select();

        if (errPart) {
            await supabaseAdmin.from('grupo_gastos')
                .update({ estado: 'anulado' }).eq('id', gastoId);
            console.error('❌ Error al insertar participantes (PUT /gastos):', errPart.message);
            return res.status(500).json({ ok: false, error: 'Error al registrar participantes' });
        }

        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('gasto_editado', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            descripcion: gasto.descripcion,
            monto:       gasto.monto,
        }), user.id);

        return res.json({ ok: true, gasto, participantes });
    } catch (err) {
        console.error('❌ Error en PUT /gastos/:gastoId:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al actualizar el gasto' });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/grupos/:grupoId/gastos/:gastoId/anular — Anula un gasto grupal
// ─────────────────────────────────────────────
router.patch('/:grupoId/gastos/:gastoId/anular', requireAuth, async (req, res) => {
    const { grupoId, gastoId } = req.params;
    const { supabaseAdmin, user } = req;

    try {
        // Verificar que existe y obtener datos para la notificación
        const { data: gastoActual } = await supabaseAdmin
            .from('grupo_gastos').select('id, pagado_por, descripcion, monto, estado')
            .eq('id', gastoId).eq('grupo_id', grupoId).maybeSingle();
        if (!gastoActual) return res.status(404).json({ ok: false, error: 'Gasto no encontrado' });
        if (gastoActual.estado !== 'activo') return res.status(409).json({ ok: false, error: 'El gasto ya está anulado' });

        // Solo quien pagó puede anular — ni el admin puede anular gastos ajenos
        if (gastoActual.pagado_por !== user.id) {
            return res.status(403).json({ ok: false, error: 'Solo quien pagó el gasto puede anularlo' });
        }

        const { error: errAnular } = await supabaseAdmin
            .from('grupo_gastos')
            .update({ estado: 'anulado', anulado_en: new Date().toISOString(), anulado_por: user.id })
            .eq('id', gastoId)
            .eq('estado', 'activo');

        if (errAnular) {
            console.error('❌ Error al anular gasto:', errAnular.message);
            return res.status(500).json({ ok: false, error: 'Error al anular el gasto' });
        }

        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('gasto_anulado', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            descripcion: gastoActual.descripcion,
            monto:       gastoActual.monto,
        }), user.id);

        return res.json({ ok: true });
    } catch (err) {
        console.error('❌ Error en PATCH /gastos/:gastoId/anular:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al anular el gasto' });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/grupos/:grupoId/gastos/:gastoId/anular-cuotas
// Anula todas las cuotas de una compra grupal en cuotas (por id_gasto_padre).
// Si hay cuotas ya vencidas, requiere { force: true } en el body.
// Solo quien pagó puede anular.
// ─────────────────────────────────────────────
router.patch('/:grupoId/gastos/:gastoId/anular-cuotas', requireAuth, async (req, res) => {
    const { grupoId, gastoId } = req.params;
    const { supabaseAdmin, user } = req;
    const { force = false } = req.body;

    try {
        // Verificar que el gasto padre existe, está activo y pertenece al grupo
        const { data: gastoPadre } = await supabaseAdmin
            .from('grupo_gastos')
            .select('id, pagado_por, descripcion, monto, estado, cuotas, id_gasto_padre')
            .eq('id', gastoId)
            .eq('grupo_id', grupoId)
            .maybeSingle();

        if (!gastoPadre) return res.status(404).json({ ok: false, error: 'Gasto no encontrado' });
        if (gastoPadre.estado === 'anulado') return res.status(409).json({ ok: false, error: 'El gasto ya está anulado' });
        if (gastoPadre.pagado_por !== user.id) {
            return res.status(403).json({ ok: false, error: 'Solo quien pagó el gasto puede anularlo' });
        }

        // El id_gasto_padre para cuotas siempre apunta al primer registro (o a sí mismo)
        const padreId = gastoPadre.id_gasto_padre ?? gastoPadre.id;

        // Obtener todas las cuotas de esta compra
        const { data: todasLasCuotas } = await supabaseAdmin
            .from('grupo_gastos')
            .select('id, fecha, estado')
            .eq('id_gasto_padre', padreId)
            .eq('grupo_id', grupoId);

        const cuotas = todasLasCuotas || [];
        const hoy = new Date().toISOString().split('T')[0];
        const tieneVencidas = cuotas.some(c => c.estado === 'activo' && (c.fecha || '') <= hoy);

        // Si hay cuotas vencidas, requerir force explícito
        if (tieneVencidas && !force) {
            return res.status(409).json({
                ok:              false,
                error:           'Esta compra tiene cuotas ya vencidas. Confirmá con force: true para anular igualmente.',
                tieneVencidas:   true,
                cuotasVencidas:  cuotas.filter(c => c.fecha <= hoy).length,
                cuotasTotales:   cuotas.length,
            });
        }

        // Anular todas las cuotas activas del grupo
        const ahora = new Date().toISOString();
        const { error: errAnular } = await supabaseAdmin
            .from('grupo_gastos')
            .update({ estado: 'anulado', anulado_en: ahora, anulado_por: user.id })
            .eq('id_gasto_padre', padreId)
            .eq('grupo_id', grupoId)
            .eq('estado', 'activo');

        if (errAnular) {
            console.error('❌ Error al anular cuotas grupales:', errAnular.message);
            return res.status(500).json({ ok: false, error: 'Error al anular las cuotas' });
        }

        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';
        const descBase = gastoPadre.descripcion.replace(/\s*\(\d+\/\d+\)$/, '');

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('gasto_anulado', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            descripcion: descBase,
            monto:       gastoPadre.monto,
        }), user.id);

        return res.json({ ok: true, cuotasAnuladas: cuotas.length });
    } catch (err) {
        console.error('❌ Error en PATCH /gastos/:gastoId/anular-cuotas:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al anular las cuotas' });
    }
});

// ─────────────────────────────────────────────
// POST /api/grupos/:grupoId/liquidaciones — Registra una liquidación
// ─────────────────────────────────────────────
router.post('/:grupoId/liquidaciones', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const { supabaseAdmin, user } = req;
    const { deUserId, paraUserId, monto, fecha, nota } = req.body;

    if (!deUserId || !paraUserId) return res.status(400).json({ ok: false, error: 'deUserId y paraUserId son requeridos' });
    if (deUserId === paraUserId) return res.status(400).json({ ok: false, error: 'El pagador y el receptor no pueden ser la misma persona' });
    if (deUserId !== req.user.id) return res.status(403).json({ ok: false, error: 'Solo podés registrar pagos que vos realizaste' });
    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });

    try {
        // Verificar membresía activa
        const { data: membresia } = await supabaseAdmin
            .from('grupo_miembros').select('id')
            .eq('grupo_id', grupoId).eq('user_id', user.id).eq('estado', 'activo').maybeSingle();
        if (!membresia) return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });

        const { data: liquidacion, error: errLiq } = await supabaseAdmin
            .from('grupo_liquidaciones')
            .insert([{
                grupo_id:      Number(grupoId),
                de_user_id:    deUserId,
                para_user_id:  paraUserId,
                monto:         montoNum,
                fecha:         fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }),
                nota:          nota?.trim() || null,
                estado:        'confirmada',
                registrado_por: user.id,
            }])
            .select()
            .single();

        if (errLiq) {
            console.error('❌ Error al registrar liquidación:', errLiq.message);
            return res.status(500).json({ ok: false, error: 'Error al registrar la liquidación' });
        }

        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('liquidacion_registrada', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            monto:       montoNum,
            de_user_id:  deUserId,
            para_user_id: paraUserId,
        }), user.id);

        return res.status(201).json({ ok: true, liquidacion });
    } catch (err) {
        console.error('❌ Error en POST /liquidaciones:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al registrar la liquidación' });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/grupos/:grupoId/liquidaciones/:liqId/anular — Anula una liquidación
// ─────────────────────────────────────────────
router.patch('/:grupoId/liquidaciones/:liqId/anular', requireAuth, async (req, res) => {
    const { grupoId, liqId } = req.params;
    const { supabaseAdmin, user } = req;

    try {
        const { data: liq } = await supabaseAdmin
            .from('grupo_liquidaciones').select('id, registrado_por, monto, estado')
            .eq('id', liqId).eq('grupo_id', grupoId).maybeSingle();
        if (!liq) return res.status(404).json({ ok: false, error: 'Liquidación no encontrada' });
        if (liq.estado !== 'confirmada') return res.status(409).json({ ok: false, error: 'La liquidación ya está anulada' });

        const esAdmin = await validarAdminGrupo(supabaseAdmin, grupoId, user.id);
        if (liq.registrado_por !== user.id && !esAdmin) {
            return res.status(403).json({ ok: false, error: 'Solo quien registró la liquidación o un admin puede anularla' });
        }

        const { error: errAnular } = await supabaseAdmin
            .from('grupo_liquidaciones')
            .update({ estado: 'anulada', anulada_en: new Date().toISOString() })
            .eq('id', liqId)
            .eq('estado', 'confirmada');

        if (errAnular) {
            console.error('❌ Error al anular liquidación:', errAnular.message);
            return res.status(500).json({ ok: false, error: 'Error al anular la liquidación' });
        }

        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('liquidacion_anulada', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            monto:       liq.monto,
        }), user.id);

        return res.json({ ok: true });
    } catch (err) {
        console.error('❌ Error en PATCH /liquidaciones/:liqId/anular:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al anular la liquidación' });
    }
});

// ─────────────────────────────────────────────
// POST /api/grupos/:grupoId/gastos-cuotas — Crea un gasto grupal en cuotas con tarjeta
// Body: { descripcion, monto, cuotas, pagadoPor, fecha, nota, idCategoria, participantesUserIds }
// Genera una fila en grupo_gastos por cada cuota, vinculadas por id_gasto_padre.
// Los participantes y sus montos se registran en grupo_gasto_participantes para cada cuota.
// ─────────────────────────────────────────────
router.post('/:grupoId/gastos-cuotas', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const { supabaseAdmin, user } = req;
    const {
        descripcion,
        monto,
        cuotas: cuotasRaw,
        pagadoPor,
        fecha,
        nota,
        idCategoria,
        participantesUserIds,
    } = req.body;

    // Validaciones de entrada
    if (!descripcion?.trim()) return res.status(400).json({ ok: false, error: 'La descripción es requerida' });
    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });
    const cantCuotas = Math.max(1, Math.min(18, parseInt(cuotasRaw) || 1));
    if (cantCuotas < 2) return res.status(400).json({ ok: false, error: 'Este endpoint requiere al menos 2 cuotas. Usá /gastos para cuota única' });
    if (!pagadoPor) return res.status(400).json({ ok: false, error: 'El pagador es requerido' });
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        return res.status(400).json({ ok: false, error: 'Se requiere al menos un participante' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const participantesUnicos = [...new Set(participantesUserIds)];
    if (participantesUnicos.some(id => !uuidRegex.test(id))) {
        return res.status(400).json({ ok: false, error: 'participantesUserIds contiene IDs inválidos' });
    }

    try {
        // Verificar membresía activa
        const { data: membresia } = await supabaseAdmin
            .from('grupo_miembros').select('id')
            .eq('grupo_id', grupoId).eq('user_id', user.id).eq('estado', 'activo').maybeSingle();
        if (!membresia) return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });

        // Verificar que todos los participantes y el pagador son miembros activos del grupo
        const uuidRegexCuotas = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegexCuotas.test(pagadoPor)) {
            return res.status(400).json({ ok: false, error: 'pagadoPor contiene un ID inválido' });
        }
        const idsAValidarCuotas = [...new Set([...participantesUnicos, pagadoPor])];
        const { data: miembrosActivosCuotas } = await supabaseAdmin
            .from('grupo_miembros').select('user_id')
            .eq('grupo_id', grupoId).eq('estado', 'activo').in('user_id', idsAValidarCuotas);
        const idsValidosCuotas = new Set((miembrosActivosCuotas || []).map(m => m.user_id));
        if (!idsValidosCuotas.has(pagadoPor)) {
            return res.status(400).json({ ok: false, error: 'El pagador no es miembro activo del grupo' });
        }
        const noMiembrosCuotas = participantesUnicos.filter(id => !idsValidosCuotas.has(id));
        if (noMiembrosCuotas.length > 0) {
            return res.status(400).json({ ok: false, error: 'Algunos participantes no son miembros activos del grupo' });
        }

        const descripcionBase = descripcion.trim().toUpperCase();
        const fechaBase = fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

        // Calcular cuotas: fecha base = 1er día del mes siguiente, cada cuota desplaza 1 mes
        const montoPorCuota = Math.floor((montoNum / cantCuotas) * 100) / 100;
        const diferencia = Math.round((montoNum - montoPorCuota * cantCuotas) * 100) / 100;
        const inicio = new Date(`${fechaBase}T00:00:00`);
        inicio.setDate(1);
        inicio.setMonth(inicio.getMonth() + 1);

        const cuotasCalculadas = Array.from({ length: cantCuotas }, (_, i) => {
            const fechaCuota = new Date(inicio);
            fechaCuota.setMonth(inicio.getMonth() + i);
            return {
                numero:      i + 1,
                monto:       i === 0 ? Math.round((montoPorCuota + diferencia) * 100) / 100 : montoPorCuota,
                fecha:       fechaCuota.toISOString().split('T')[0],
                descripcion: `${descripcionBase} (${i + 1}/${cantCuotas})`,
            };
        });

        // Insertar primera cuota para obtener el id que será el padre de todas
        const { data: primera, error: errPrimera } = await supabaseAdmin
            .from('grupo_gastos')
            .insert([{
                grupo_id:       Number(grupoId),
                descripcion:    cuotasCalculadas[0].descripcion,
                monto:          cuotasCalculadas[0].monto,
                pagado_por:     pagadoPor,
                fecha:          cuotasCalculadas[0].fecha,
                nota:           nota?.trim() || null,
                id_categoria:   idCategoria || null,
                creado_por:     user.id,
                cuotas:         cantCuotas,
                numero_cuota:   1,
                id_gasto_padre: null, // se actualiza a continuación
                metodo_pago:    'TARJETA DE CREDITO',
            }])
            .select()
            .single();

        if (errPrimera) {
            console.error('❌ Error al insertar primera cuota grupal:', errPrimera.message);
            return res.status(500).json({ ok: false, error: 'Error al crear el gasto en cuotas' });
        }

        // Vincular la primera cuota a sí misma como padre
        await supabaseAdmin.from('grupo_gastos')
            .update({ id_gasto_padre: primera.id })
            .eq('id', primera.id);

        // Insertar cuotas 2..N apuntando a la primera como padre
        let gastosRestantes = [];
        if (cantCuotas > 1) {
            const filasRestantes = cuotasCalculadas.slice(1).map(c => ({
                grupo_id:       Number(grupoId),
                descripcion:    c.descripcion,
                monto:          c.monto,
                pagado_por:     pagadoPor,
                fecha:          c.fecha,
                nota:           nota?.trim() || null,
                id_categoria:   idCategoria || null,
                creado_por:     user.id,
                cuotas:         cantCuotas,
                numero_cuota:   c.numero,
                id_gasto_padre: primera.id,
                metodo_pago:    'TARJETA DE CREDITO',
            }));

            const { data: resto, error: errResto } = await supabaseAdmin
                .from('grupo_gastos').insert(filasRestantes).select();

            if (errResto) {
                // Rollback: anular la primera cuota huérfana
                await supabaseAdmin.from('grupo_gastos')
                    .update({ estado: 'anulado', anulado_en: new Date().toISOString(), anulado_por: user.id })
                    .eq('id', primera.id);
                console.error('❌ Error al insertar cuotas restantes:', errResto.message);
                return res.status(500).json({ ok: false, error: 'Error al crear las cuotas' });
            }
            gastosRestantes = resto || [];
        }

        const todosLosGastos = [{ ...primera, id_gasto_padre: primera.id }, ...gastosRestantes];

        // Registrar participantes para cada cuota
        // El monto asignado a cada participante se calcula sobre el monto de esa cuota específica
        const filasParticipantes = todosLosGastos.flatMap(g =>
            calcularParticipantes(g.id, g.monto, pagadoPor, participantesUnicos)
        );

        const { data: participantes, error: errPart } = await supabaseAdmin
            .from('grupo_gasto_participantes').insert(filasParticipantes).select();

        if (errPart) {
            // Rollback: anular todas las cuotas creadas
            await supabaseAdmin.from('grupo_gastos')
                .update({ estado: 'anulado', anulado_en: new Date().toISOString(), anulado_por: user.id })
                .eq('id_gasto_padre', primera.id);
            console.error('❌ Error al insertar participantes de cuotas:', errPart.message);
            return res.status(500).json({ ok: false, error: 'Error al registrar participantes' });
        }

        // Notificar miembros del grupo (sin bloquear respuesta)
        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('gasto_creado', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            descripcion: descripcionBase,
            monto:       montoNum,
        }), user.id);

        return res.status(201).json({
            ok:           true,
            gasto:        { ...primera, id_gasto_padre: primera.id },
            gastos:       todosLosGastos,
            participantes,
        });
    } catch (err) {
        console.error('❌ Error en POST /gastos-cuotas:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al crear el gasto en cuotas' });
    }
});

module.exports = router;
