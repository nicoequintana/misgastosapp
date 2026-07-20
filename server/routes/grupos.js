const express = require('express');
const { supabaseAdmin: supabaseAdminSingleton } = require('../services/supabaseAdmin');
const { enviarEmailInvitacionGrupo, enviarEmailInvitacionRegistro } = require('../services/email');
const { persistirNotificacion, actualizarEstadoEmailDb, getConfigUsuario } = require('../services/notificacionesDb');
const { procesarEnvioEmail, buildNotificacionGrupo } = require('../services/notificaciones');

const router = express.Router();

// ─────────────────────────────────────────────
// Validación central de parámetros de ruta
// ─────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fecha de hoy en zona horaria Argentina (UTC-3), formato YYYY-MM-DD.
// El literal 'America/Argentina/Buenos_Aires' estaba repetido 3 veces en este
// archivo (R5 — mejoras.md).
const fechaHoyArgentina = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

router.param('grupoId', (req, res, next, value) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ ok: false, error: 'ID de grupo inválido' });
    }
    next();
});

router.param('gastoId', (req, res, next, value) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ ok: false, error: 'ID de gasto inválido' });
    }
    next();
});

router.param('liqId', (req, res, next, value) => {
    if (!UUID_REGEX.test(value)) {
        return res.status(400).json({ ok: false, error: 'ID de liquidación inválido' });
    }
    next();
});

// ───────────────────────────────────────────────
// Máximo 10 invitaciones por grupo por hora — consultado directo en DB para sobrevivir reinicios.
const RATE_LIMIT_MAX = 10;
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

// Valida participantesUserIds/pagadoPor (formato UUID + membresía activa) y el
// método de pago (existe, es global o propio del pagador, y si requiereCuotas
// además acepta cuotas). Usado por POST/PUT /gastos y POST /gastos-cuotas para
// evitar que las 3 rutas repliquen y desincronicen la misma validación.
// Devuelve { error: { status, mensaje } } en caso de fallo, o { participantesUnicos, metodoPago } en éxito.
const validarParticipantesYMetodoPago = async (supabaseAdmin, {
    grupoId,
    pagadoPor,
    participantesUserIds,
    idMetodoPago,
    requiereCuotas = false,
}) => {
    const participantesUnicos = [...new Set(participantesUserIds)];
    if (participantesUnicos.some(id => !UUID_REGEX.test(id))) {
        return { error: { status: 400, mensaje: 'participantesUserIds contiene IDs inválidos' } };
    }
    if (!UUID_REGEX.test(pagadoPor)) {
        return { error: { status: 400, mensaje: 'pagadoPor contiene un ID inválido' } };
    }

    // El método de pago debe existir y ser global o propio del pagador (metodos_pago
    // puede ser global o por usuario — no se acepta el ID de un método privado ajeno).
    // pagadoPor ya fue validado como UUID arriba, por lo que es seguro interpolarlo acá.
    const { data: metodoPago } = await supabaseAdmin
        .from('metodos_pago').select('id, acepta_cuotas')
        .eq('id', idMetodoPago)
        .or(`user_id.is.null,user_id.eq.${pagadoPor}`)
        .maybeSingle();
    if (!metodoPago) return { error: { status: 400, mensaje: 'Método de pago inválido' } };
    if (requiereCuotas && !metodoPago.acepta_cuotas) {
        return { error: { status: 400, mensaje: 'El método de pago seleccionado no acepta cuotas' } };
    }

    // Verificar que todos los participantes y el pagador son miembros activos del grupo
    const idsAValidar = [...new Set([...participantesUnicos, pagadoPor])];
    const { data: miembrosActivos } = await supabaseAdmin
        .from('grupo_miembros').select('user_id')
        .eq('grupo_id', grupoId).eq('estado', 'activo').in('user_id', idsAValidar);
    const idsValidos = new Set((miembrosActivos || []).map(m => m.user_id));
    if (!idsValidos.has(pagadoPor)) {
        return { error: { status: 400, mensaje: 'El pagador no es miembro activo del grupo' } };
    }
    const noMiembros = participantesUnicos.filter(id => !idsValidos.has(id));
    if (noMiembros.length > 0) {
        return { error: { status: 400, mensaje: 'Algunos participantes no son miembros activos del grupo' } };
    }

    return { participantesUnicos, metodoPago };
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
 * Verifica el rate limit consultando grupo_invitaciones en Supabase.
 * Durable frente a reinicios y compatible con múltiples instancias.
 * Retorna true si el límite fue superado, false si el request puede continuar.
 *
 * @param {string|number} grupoId
 */
const superaRateLimit = async (grupoId) => {
    const hace1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabaseAdminSingleton
        .from('grupo_invitaciones')
        .select('id', { count: 'exact', head: true })
        .eq('grupo_id', Number(grupoId))
        .gte('created_at', hace1h);

    if (error) {
        // Fail closed (fix S-03): si la query de conteo falla no podemos saber si el
        // límite ya fue superado, así que bloqueamos el request en lugar de permitirlo.
        // Antes esto fallaba abierto y un error puntual de DB anulaba el único control
        // anti-spam de invitaciones (email-bombing).
        console.error('❌ Rate limit check fallido, se bloquea el request por seguridad:', error.message);
        return true;
    }

    return (count ?? 0) >= RATE_LIMIT_MAX;
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
    if (await superaRateLimit(grupoId)) {
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
                    error: 'Este email ya es parte del grupo.',
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
            return res.json({ ok: true, registrado: false, yaEsMiembro: false });
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
            usuario: {
                nombre: nombreDesdeAuthUser(usuarioEncontrado),
                email:  usuarioEncontrado.email || null,
            },
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
        if (await superaRateLimit(grupoId)) {
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

    if (!UUID_REGEX.test(token.trim())) {
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

        // 7. Verificar que el grupo existe y no está archivado
        const { data: grupoValido } = await supabaseAdmin
            .from('grupos_gastos')
            .select('id, archivado')
            .eq('id', invitacion.grupo_id)
            .maybeSingle();

        if (!grupoValido) {
            return res.status(410).json({ ok: false, error: 'El grupo al que pertenece esta invitación ya no existe.' });
        }
        if (grupoValido.archivado) {
            return res.status(410).json({ ok: false, error: 'Este grupo está archivado y no acepta nuevas invitaciones.' });
        }

        // 8. Llamar RPC transaccional con service role
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
    const { descripcion, monto, pagadoPor, fecha, nota, idCategoria, idMetodoPago, participantesUserIds } = req.body;

    if (!descripcion?.trim()) return res.status(400).json({ ok: false, error: 'La descripción es requerida' });
    if (descripcion.trim().length > 500) return res.status(400).json({ ok: false, error: 'La descripción no puede exceder 500 caracteres' });
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });
    if (!pagadoPor) return res.status(400).json({ ok: false, error: 'El pagador es requerido' });
    if (!idMetodoPago) return res.status(400).json({ ok: false, error: 'El método de pago es requerido' });
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        return res.status(400).json({ ok: false, error: 'Se requiere al menos un participante' });
    }

    try {
        // Verificar membresía activa
        const { data: membresia } = await supabaseAdmin
            .from('grupo_miembros').select('id')
            .eq('grupo_id', grupoId).eq('user_id', user.id).eq('estado', 'activo').maybeSingle();
        if (!membresia) return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });

        const { error: errValidacion, participantesUnicos } = await validarParticipantesYMetodoPago(supabaseAdmin, {
            grupoId, pagadoPor, participantesUserIds, idMetodoPago,
        });
        if (errValidacion) return res.status(errValidacion.status).json({ ok: false, error: errValidacion.mensaje });

        const { data: gasto, error: errGasto } = await supabaseAdmin
            .from('grupo_gastos')
            .insert([{
                grupo_id:       Number(grupoId),
                descripcion:    descripcion.trim().toUpperCase(),
                monto:          montoNum,
                pagado_por:     pagadoPor,
                fecha:          `${fecha || fechaHoyArgentina()}T12:00:00-03:00`,
                nota:           nota?.trim() || null,
                id_categoria:   idCategoria || null,
                id_metodo_pago: idMetodoPago,
                creado_por:     user.id,
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
    const { descripcion, monto, cuotas, pagadoPor, fecha, primeraCuota, nota, idCategoria, idMetodoPago, participantesUserIds } = req.body;

    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        return res.status(400).json({ ok: false, error: 'Se requiere al menos un participante' });
    }
    if (descripcion !== undefined && descripcion.trim().length > 500) {
        return res.status(400).json({ ok: false, error: 'La descripción no puede exceder 500 caracteres' });
    }
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });
    if (!idMetodoPago) return res.status(400).json({ ok: false, error: 'El método de pago es requerido' });

    try {
        // Solo quien pagó puede editar
        const { data: gastoActual } = await supabaseAdmin
            .from('grupo_gastos').select('id, pagado_por, descripcion, monto')
            .eq('id', gastoId).eq('grupo_id', grupoId).eq('estado', 'activo').maybeSingle();
        if (!gastoActual) return res.status(404).json({ ok: false, error: 'Gasto no encontrado o ya anulado' });
        if (gastoActual.pagado_por !== user.id) return res.status(403).json({ ok: false, error: 'Solo quien pagó el gasto puede editarlo' });

        const { error: errValidacion, participantesUnicos } = await validarParticipantesYMetodoPago(supabaseAdmin, {
            grupoId, pagadoPor, participantesUserIds, idMetodoPago,
        });
        if (errValidacion) return res.status(errValidacion.status).json({ ok: false, error: errValidacion.mensaje });

        // Update del gasto + recálculo de fechas de cuotas hermanas + reemplazo de
        // participantes, todo en una sola transacción de Postgres (RPC
        // update_grupo_gasto_installments — ver server/db/migrations/20260722_*.sql).
        // Antes eran 5 pasos no-transaccionales encadenados: si alguno fallaba a
        // mitad de camino, las cuotas quedaban con fechas desincronizadas entre sí,
        // o el gasto quedaba sin participantes.
        const { data: gasto, error: errRpc } = await supabaseAdmin
            .rpc('update_grupo_gasto_installments', {
                p_gasto_id: Number(gastoId),
                p_descripcion: descripcion.trim().toUpperCase(),
                p_monto: montoNum,
                p_pagado_por: pagadoPor,
                p_fecha: fecha || null,
                p_participantes: participantesUnicos,
                p_id_categoria: idCategoria || null,
                p_id_metodo_pago: idMetodoPago,
                p_nota: nota?.trim() || null,
                p_primera_cuota: primeraCuota || null,
                p_cuotas: cuotas ? Math.max(1, Math.min(18, parseInt(cuotas, 10))) : null,
            })
            .single();

        if (errRpc) {
            console.error('❌ Error en update_grupo_gasto_installments:', errRpc.message);
            return res.status(500).json({ ok: false, error: 'Error al actualizar el gasto' });
        }
        if (!gasto) return res.status(404).json({ ok: false, error: 'El gasto no existe o ya fue anulado' });

        const { data: participantes, error: errPart } = await supabaseAdmin
            .from('grupo_gasto_participantes').select().eq('gasto_id', gasto.id);

        if (errPart) {
            console.error('❌ Error al leer participantes tras editar:', errPart.message);
            return res.status(500).json({ ok: false, error: 'Error al leer participantes del gasto' });
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
        const hoy = fechaHoyArgentina();
        const tieneVencidas = cuotas.some(c => c.estado === 'activo' && (c.fecha || '').split('T')[0] <= hoy);

        // Si hay cuotas vencidas, requerir force explícito
        if (tieneVencidas && !force) {
            return res.status(409).json({
                ok:              false,
                error:           'Esta compra tiene cuotas ya vencidas. Confirmá con force: true para anular igualmente.',
                tieneVencidas:   true,
                cuotasVencidas:  cuotas.filter(c => (c.fecha || '').split('T')[0] <= hoy).length,
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
    // Fix S-01: paraUserId antes no se validaba como UUID ni como miembro del grupo,
    // permitiendo fabricar liquidaciones falsas contra cualquier ID arbitrario y
    // falsear el saldo propio en vw_grupo_saldos. Se exige el mismo formato que el resto de IDs de usuario.
    if (!UUID_REGEX.test(paraUserId)) return res.status(400).json({ ok: false, error: 'paraUserId contiene un ID inválido' });
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });

    try {
        // Verificar membresía activa del caller Y del receptor (paraUserId) en una sola consulta.
        const { data: miembrosActivos } = await supabaseAdmin
            .from('grupo_miembros').select('user_id')
            .eq('grupo_id', grupoId).eq('estado', 'activo').in('user_id', [user.id, paraUserId]);
        const idsActivos = new Set((miembrosActivos || []).map(m => m.user_id));
        if (!idsActivos.has(user.id)) return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });
        if (!idsActivos.has(paraUserId)) return res.status(400).json({ ok: false, error: 'El receptor no es miembro activo del grupo' });

        const { data: liquidacion, error: errLiq } = await supabaseAdmin
            .from('grupo_liquidaciones')
            .insert([{
                grupo_id:      Number(grupoId),
                de_user_id:    deUserId,
                para_user_id:  paraUserId,
                monto:         montoNum,
                fecha:         fecha || fechaHoyArgentina(),
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
        primeraCuota,
        nota,
        idCategoria,
        idMetodoPago,
        participantesUserIds,
    } = req.body;

    // Validaciones de entrada
    if (!descripcion?.trim()) return res.status(400).json({ ok: false, error: 'La descripción es requerida' });
    if (descripcion.trim().length > 500) return res.status(400).json({ ok: false, error: 'La descripción no puede exceder 500 caracteres' });
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });
    const cantCuotas = Math.max(1, Math.min(18, parseInt(cuotasRaw, 10) || 1));
    if (!pagadoPor) return res.status(400).json({ ok: false, error: 'El pagador es requerido' });
    if (!primeraCuota || !/^\d{4}-\d{2}$/.test(primeraCuota.slice(0, 7))) {
        return res.status(400).json({ ok: false, error: 'Indicá en qué mes vence la primera cuota (YYYY-MM)' });
    }
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        return res.status(400).json({ ok: false, error: 'Se requiere al menos un participante' });
    }
    if (!idMetodoPago) return res.status(400).json({ ok: false, error: 'El método de pago es requerido' });

    try {
        // Verificar membresía activa
        const { data: membresia } = await supabaseAdmin
            .from('grupo_miembros').select('id')
            .eq('grupo_id', grupoId).eq('user_id', user.id).eq('estado', 'activo').maybeSingle();
        if (!membresia) return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });

        const { error: errValidacion, participantesUnicos } = await validarParticipantesYMetodoPago(supabaseAdmin, {
            grupoId, pagadoPor, participantesUserIds, idMetodoPago, requiereCuotas: true,
        });
        if (errValidacion) return res.status(errValidacion.status).json({ ok: false, error: errValidacion.mensaje });

        const descripcionBase = descripcion.trim().toUpperCase();

        // Todas las cuotas y sus participantes se insertan en una sola transacción
        // de Postgres (RPC create_grupo_gasto_installments — ver
        // server/db/migrations/20260721_*.sql). Antes esto eran 3 pasos separados
        // (insert cuota 1 -> insert cuotas 2..N -> insert participantes) con
        // rollback manual vía UPDATE estado='anulado': si el proceso perdía
        // conexión a mitad de camino, quedaban cuotas grupales huérfanas o con
        // participantes parciales. El RPC garantiza todo-o-nada.
        const { data: todosLosGastos, error: errRpc } = await supabaseAdmin.rpc('create_grupo_gasto_installments', {
            p_grupo_id: Number(grupoId),
            p_descripcion: descripcionBase,
            p_monto_total: montoNum,
            p_cuotas: cantCuotas,
            p_fecha_primera_cuota: primeraCuota,
            p_pagado_por: pagadoPor,
            p_creado_por: user.id,
            p_participantes: participantesUnicos,
            p_id_categoria: idCategoria || null,
            p_id_metodo_pago: idMetodoPago,
            p_nota: nota?.trim() || null,
        });

        if (errRpc) {
            console.error('❌ Error en create_grupo_gasto_installments:', errRpc.message);
            return res.status(500).json({ ok: false, error: 'Error al crear el gasto en cuotas' });
        }
        if (!todosLosGastos?.length) {
            return res.status(500).json({ ok: false, error: 'Error al crear el gasto en cuotas' });
        }

        const primera = todosLosGastos[0];
        const idsGastos = todosLosGastos.map(g => g.id);
        const { data: participantes, error: errPart } = await supabaseAdmin
            .from('grupo_gasto_participantes').select().in('gasto_id', idsGastos);

        if (errPart) {
            console.error('❌ Error al leer participantes de cuotas recién creadas:', errPart.message);
            return res.status(500).json({ ok: false, error: 'Error al leer participantes del gasto' });
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
            gasto:        primera,
            gastos:       todosLosGastos,
            participantes,
        });
    } catch (err) {
        console.error('❌ Error en POST /gastos-cuotas:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al crear el gasto en cuotas' });
    }
});

module.exports = router;
