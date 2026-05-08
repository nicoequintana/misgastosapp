const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { enviarEmailInvitacionGrupo, enviarEmailInvitacionRegistro } = require('../services/email');

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
        // Siempre instanciar con service role para validar tokens de cualquier usuario
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_KEY,
            { auth: { persistSession: false } }
        );
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ ok: false, error: 'Token inválido o sesión expirada' });
        }

        req.user         = user;
        req.supabaseAdmin = supabaseAdmin; // service role — solo para queries necesarias
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
            .ilike('email_invitado', email)
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
            usuario: {
                id: usuarioEncontrado.id,
                email: usuarioEncontrado.email,
                nombre: nombreDesdeAuthUser(usuarioEncontrado),
            },
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
                email,
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
        // Verificar que el solicitante es admin del grupo
        await validarAdminGrupo(supabaseAdmin, grupoId, userId);

        // Verificar que todos los saldos netos son cero
        const { data: saldos, error: errSaldos } = await supabaseAdmin
            .from('vw_grupo_saldos')
            .select('user_id, saldo_neto')
            .eq('grupo_id', grupoId);

        if (errSaldos) {
            console.error('❌ Error al consultar saldos:', errSaldos.message);
            return res.status(500).json({ ok: false, error: 'Error al verificar saldos del grupo' });
        }

        const saldosPendientes = (saldos || []).filter((s) => Math.abs(s.saldo_neto) >= 0.01);
        if (saldosPendientes.length > 0) {
            return res.status(422).json({
                ok: false,
                error: 'No se puede eliminar el grupo porque hay saldos pendientes. Liquidá todas las deudas antes de eliminar.',
            });
        }

        // Eliminar el grupo — RLS y FK CASCADE se encargan del resto
        const { error: errDel } = await supabaseAdmin
            .from('grupos')
            .delete()
            .eq('id', grupoId);

        if (errDel) {
            console.error('❌ Error al eliminar grupo:', errDel.message);
            return res.status(500).json({ ok: false, error: 'No se pudo eliminar el grupo' });
        }

        return res.json({ ok: true });

    } catch (err) {
        const status = err.message?.includes('permisos') || err.message?.includes('admin') ? 403 : 500;
        console.error('❌ Error en DELETE /grupos/:grupoId:', err.message);
        return res.status(status).json({ ok: false, error: err.message || 'Error interno al eliminar el grupo' });
    }
});

module.exports = router;
