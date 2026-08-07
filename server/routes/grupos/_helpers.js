// ─────────────────────────────────────────────
// Helpers y middleware compartidos entre los sub-routers de grupos
// (invitaciones, grupo, gastos, liquidaciones).
// Refactor R2 (mejoras.md): extraído de server/routes/grupos.js sin
// cambiar ninguna lógica — solo movimiento mecánico de código.
// ─────────────────────────────────────────────
const { supabaseAdmin: supabaseAdminSingleton } = require('../../services/supabaseAdmin');
const { persistirNotificacion, actualizarEstadoEmailDb, getConfigUsuario } = require('../../services/notificacionesDb');
const { procesarEnvioEmail } = require('../../services/notificaciones');

// ─────────────────────────────────────────────
// Validación central de parámetros de ruta
// ─────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fecha de hoy en zona horaria Argentina (UTC-3), formato YYYY-MM-DD.
// El literal 'America/Argentina/Buenos_Aires' estaba repetido 3 veces en este
// archivo (R5 — mejoras.md).
const fechaHoyArgentina = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

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

// Límite de la búsqueda paginada de usuarios: PAGINAS_MAX * USUARIOS_POR_PAGINA
// = 2000 usuarios explorados como máximo. Pasado ese límite, buscarUsuarioPorEmail
// retorna null como si el usuario no existiera (ver AUTH-03/API-10 en mejoras.md).
const USUARIOS_POR_PAGINA = 200;
const PAGINAS_MAX = 10;

const buscarUsuarioPorEmail = async (supabaseAdmin, email) => {
    const emailBuscado = (email || '').toLowerCase().trim();
    if (!emailBuscado) return null;

    let page = 1;
    const perPage = USUARIOS_POR_PAGINA;

    while (page <= PAGINAS_MAX) {
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
        .gte('fecha_creacion', hace1h);

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

module.exports = {
    supabaseAdminSingleton,
    UUID_REGEX,
    EMAIL_REGEX,
    RATE_LIMIT_MAX,
    fechaHoyArgentina,
    nombreDesdeAuthUser,
    USUARIOS_POR_PAGINA,
    PAGINAS_MAX,
    buscarUsuarioPorEmail,
    validarParticipantesYMetodoPago,
    validarAdminGrupo,
    superaRateLimit,
    requireAuth,
    notificarMiembros,
    calcularParticipantes,
};
