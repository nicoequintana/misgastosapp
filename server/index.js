const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const { normalizeAmount, generateFingerprint, compararApiKey } = require('./utils');
const { supabaseAdmin } = require('./services/supabaseAdmin');
const notificacionesRouter = require('./routes/notificaciones');
const gruposRouter = require('./routes/grupos');
const authRouter = require('./routes/auth');
const { buildNotificacionN8n } = require('./services/notificaciones');
const { persistirNotificacion, actualizarEstadoEmailDb, getConfigUsuario } = require('./services/notificacionesDb');
const { procesarEnvioEmail } = require('./services/notificaciones');
require('dotenv').config();

// En local, si NODE_ENV no está seteado, usar development por defecto.
// En despliegues reales debe definirse explícitamente.
if (!process.env.NODE_ENV) {
    console.warn('⚠️ NODE_ENV no está seteado — asumiendo development para entorno local');
    process.env.NODE_ENV = 'development';
}

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// ==================== CONFIGURACIÓN DE SEGURIDAD ====================

/**
 * Middleware para validar la API Key de n8n.
 * Protege los endpoints de integración.
 * En producción, la API Key es obligatoria.
 */
const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.N8N_API_KEY;

    // API Key siempre requerida — sin excepciones por entorno
    if (!expectedKey) {
        console.error('❌ CRÍTICO: N8N_API_KEY no configurada');
        return res.status(500).json({ ok: false, error: 'Servidor: API Key no configurada' });
    }

    // Comparación en tiempo constante — evita timing attack para adivinar N8N_API_KEY
    // byte a byte (fix S-02).
    if (!compararApiKey(apiKey, expectedKey)) {
        return res.status(401).json({ ok: false, error: 'No autorizado' });
    }

    next();
};

// En producción, FRONTEND_URL es obligatorio. Un fallback a true abriría CORS a cualquier origen.
if (isProduction && !process.env.FRONTEND_URL) {
    console.error('❌ CRÍTICO: FRONTEND_URL no configurada en producción. El servidor no puede iniciarse de forma segura.');
    process.exit(1);
}

const corsOrigin = isProduction
    ? process.env.FRONTEND_URL
    : (process.env.FRONTEND_URL || 'http://localhost:5173');

const corsOptions = {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization']
};

const supabaseHost = process.env.SUPABASE_URL
    ? new URL(process.env.SUPABASE_URL).host
    : '*.supabase.co';

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // Supabase: auth, DB, storage, realtime
            connectSrc: ["'self'", `https://${supabaseHost}`, 'https://*.supabase.co', 'wss://*.supabase.co'],
            // Google OAuth y fuentes externas de UI
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
            frameSrc: ["'self'", 'https://accounts.google.com'],
            workerSrc: ["'self'", 'blob:'],
        },
    },
}));
app.use(compression());
app.use(cors(corsOptions));
// Límite estricto de payload — el endpoint n8n nunca necesita más de 10kb
app.use(express.json({ limit: '10kb' }));

// Necesario en prod: la app corre detrás de un proxy (Render/Railway) que agrega X-Forwarded-For.
// Sin esto, express-rate-limit no puede identificar la IP real del cliente.
if (isProduction) app.set('trust proxy', 1);

// Rate limiting por IP — global conservador + estricto en endpoints sensibles
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false }));
app.use('/api/notifications', rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }));
app.use('/api/integrations', rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api/grupos', rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }));

// En producción, Express sirve el build estático del frontend
if (isProduction) {
    const staticPath = path.join(__dirname, 'public');
    app.use(express.static(staticPath));
}

// ==================== INICIALIZACIÓN DE SUPABASE ====================

const isSupabaseConfigured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);


// ==================== HELPERS ====================

/**
 * Persiste una notificación de n8n en Supabase y envía el email si corresponde.
 * Es fire-and-forget: nunca interrumpe el flujo principal.
 *
 * @param {string} userId - UUID del usuario
 * @param {'creado'|'duplicado'|'error'} resultado
 * @param {Object} datos - Datos del gasto o del error
 * @param {string} [emailUsuario] - Email del usuario para envío
 */
const dispararNotificacionN8n = async (userId, resultado, datos, emailUsuario) => {
    try {
        const notificacion = buildNotificacionN8n(resultado, datos);

        // Persistir en Supabase via service role
        const creada = await persistirNotificacion(userId, notificacion);
        if (!creada) return;

        // Enviar email si el usuario tiene configuración habilitada
        if (emailUsuario) {
            const config = await getConfigUsuario(userId);
            if (config?.email_habilitado && config?.email_notificaciones_n8n) {
                const { emailEnviado, emailError } = await procesarEnvioEmail(emailUsuario, creada, config);
                await actualizarEstadoEmailDb(creada.id, emailEnviado, emailError || null);
            }
        }
    } catch (err) {
        // Nunca interrumpir el flujo principal por un error de notificación
        console.error('❌ Error en dispararNotificacionN8n:', err.message);
    }
};

// ==================== RUTAS ====================

// Rutas de notificaciones (envío de emails)
app.use('/api/notifications', notificacionesRouter);

// Rutas del módulo de grupos de gastos compartidos
app.use('/api/grupos', gruposRouter);

// Rutas de autenticación (verificación de email duplicado, recuperación de clave)
app.use('/api/auth', authRouter);

// ==================== ENDPOINTS DE INTEGRACIÓN ====================

/**
 * INTEGRACIÓN n8n -> Registro de Gastos
 * POST /api/integrations/n8n/gasto
 * Requiere: x-api-key en el header
 */
app.post('/api/integrations/n8n/gasto', validateApiKey, async (req, res) => {
    const { descripcion, monto, categoria, medioPago, user_id } = req.body;

    // 1. Validaciones básicas de presencia
    if (!descripcion || monto === undefined || !categoria || !medioPago || !user_id) {
        return res.status(400).json({
            ok: false,
            error: 'Faltan campos obligatorios: descripcion, monto, categoria, medioPago, user_id'
        });
    }

    // 2. Validar longitud de descripcion — previene DoS por strings masivos
    if (typeof descripcion !== 'string' || descripcion.trim().length === 0 || descripcion.length > 500) {
        return res.status(400).json({ ok: false, error: 'descripcion debe tener entre 1 y 500 caracteres' });
    }

    // 3. Validar que monto sea un número válido, positivo y finito
    const normalizedMonto = normalizeAmount(monto);
    if (isNaN(normalizedMonto) || !isFinite(normalizedMonto) || normalizedMonto <= 0) {
        return res.status(400).json({ ok: false, error: 'Monto debe ser mayor a cero' });
    }

    // 4. Validar que categoria y medioPago sean números enteros válidos
    const categoriaNum = Number(categoria);
    const mediaNum = Number(medioPago);
    if (!Number.isInteger(categoriaNum) || !Number.isInteger(mediaNum) || categoriaNum <= 0 || mediaNum <= 0) {
        return res.status(400).json({
            ok: false,
            error: 'categoria y medioPago deben ser IDs numéricos válidos y mayores a cero'
        });
    }

    // 5. Validar que user_id sea un UUID válido antes de consultar Supabase
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(user_id)) {
        return res.status(400).json({ ok: false, error: 'Datos de usuario inválidos' });
    }

    // 6. Validar email_usuario si viene — previene email header injection
    const emailRaw = req.body.email_usuario || null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRaw && !emailRegex.test(emailRaw)) {
        return res.status(400).json({ ok: false, error: 'email_usuario inválido' });
    }
    const emailUsuario = emailRaw;

    // Fecha en hora Argentina (UTC-3) para evitar que entre las 21:00 y 00:00
    // toISOString() devuelva el día siguiente (que está en UTC).
    const fechaActual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    const expenseData = {
        descripcion: descripcion.trim(),
        monto: normalizedMonto,
        categoria: categoriaNum.toString(),
        medioPago: mediaNum.toString(),
        fecha: fechaActual,
        user_id,
    };

    const fingerprint = generateFingerprint(expenseData);

    try {
        if (isSupabaseConfigured) {
            // Verificar que el user_id existe en auth.users antes de insertar.
            // Mensaje genérico para no confirmar existencia de UUIDs (evita user enumeration).
            const { data: usuarioExiste, error: errorUser } = await supabaseAdmin
                .from('usuarios')
                .select('id')
                .eq('id', user_id)
                .maybeSingle();

            if (errorUser || !usuarioExiste) {
                return res.status(400).json({ ok: false, error: 'Datos de usuario inválidos' });
            }

            // Verificar duplicados por fingerprint
            const { data: existing } = await supabaseAdmin
                .from('gastos')
                .select('id')
                .eq('huella_digital', fingerprint)
                .maybeSingle();

            if (existing) {
                // Notificar duplicado en segundo plano
                dispararNotificacionN8n(user_id, 'duplicado', expenseData, emailUsuario);
                return res.json({
                    ok: true,
                    created: false,
                    duplicated: true,
                    message: 'Gasto duplicado detectado — no se registró',
                });
            }

            // Insertar en Supabase con fecha consistente
            const { data, error } = await supabaseAdmin.from('gastos').insert([{
                user_id:        user_id,
                descripcion:    expenseData.descripcion.toUpperCase(),
                monto:          expenseData.monto,
                id_categoria:   categoriaNum,
                id_metodo_pago: mediaNum,
                fecha:          `${fechaActual}T12:00:00Z`,
                es_fijo:        false,
                huella_digital: fingerprint
            }]).select();

            if (error) throw error;

            // Notificar éxito en segundo plano
            dispararNotificacionN8n(user_id, 'creado', {
                ...expenseData,
                descripcion: expenseData.descripcion.toUpperCase(),
            }, emailUsuario);

            return res.status(201).json({
                ok: true,
                created: true,
                duplicated: false,
                message: 'Gasto registrado correctamente',
                expense: data[0],
            });

        } else {
            // Modo Desarrollo (Simulado) — solo permitir si NO es producción
            if (isProduction) {
                return res.status(500).json({ ok: false, error: 'Supabase no configurado en producción' });
            }
            return res.status(201).json({
                ok: true,
                created: true,
                duplicated: false,
                message: 'Modo Mock: Gasto procesado (No persistido en DB)',
            });
        }
    } catch (error) {
        console.error('❌ Error en integración n8n:', error);
        // Notificar error en segundo plano (el motivo interno no se expone al cliente)
        dispararNotificacionN8n(user_id, 'error', {
            ...expenseData,
            motivo: error.message,
        }, emailUsuario);
        res.status(500).json({ ok: false, error: 'Error interno al procesar el gasto' });
    }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Catch-all: devuelve el index.html del frontend para rutas de React Router
if (isProduction) {
    app.get('/*path', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
}

app.listen(PORT, () => console.log(`🚀 Servidor de Integraciones corriendo en puerto ${PORT}`));
