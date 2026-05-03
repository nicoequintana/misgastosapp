const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { normalizeAmount, generateFingerprint } = require('./utils');
require('dotenv').config();

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

    // En producción, la API Key es obligatoria
    if (isProduction && !expectedKey) {
        console.error('❌ CRÍTICO: N8N_API_KEY no configurada en producción');
        return res.status(500).json({ ok: false, error: 'Servidor: API Key no configurada' });
    }

    // Si hay una API Key configurada, validarla
    if (expectedKey && apiKey !== expectedKey) {
        return res.status(401).json({ ok: false, error: 'No autorizado: API Key inválida o ausente' });
    }

    // En desarrollo sin API Key configurada, permitir (log de advertencia)
    if (!expectedKey && !isProduction) {
        console.warn('⚠️ N8N_API_KEY no configurada en desarrollo. Saltando validación.');
    }

    next();
};

// En producción Express sirve el frontend desde /public,
// así que el origen del CORS es el propio servidor.
const corsOrigin = isProduction
    ? (process.env.FRONTEND_URL || true)
    : (process.env.FRONTEND_URL || 'http://localhost:5173');

const corsOptions = {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-api-key']
};

app.use(cors(corsOptions));
app.use(express.json());

// En producción, Express sirve el build estático del frontend
if (isProduction) {
    const staticPath = path.join(__dirname, 'public');
    app.use(express.static(staticPath));
}

// ==================== INICIALIZACIÓN DE SUPABASE ====================

let supabase;
const isSupabaseConfigured = process.env.SUPABASE_URL && process.env.SUPABASE_KEY;

if (isSupabaseConfigured) {
    supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
    );
}


// ==================== ENDPOINTS DE INTEGRACIÓN ====================

/**
 * INTEGRACIÓN n8n -> Registro de Gastos
 * POST /api/integrations/n8n/gasto
 * Requiere: x-api-key en el header
 */
app.post('/api/integrations/n8n/gasto', validateApiKey, async (req, res) => {
    const { descripcion, monto, categoria, medioPago, user_id } = req.body;

    // 1. Validaciones básicas
    if (!descripcion || monto === undefined || !categoria || !medioPago || !user_id) {
        return res.status(400).json({
            ok: false,
            error: 'Faltan campos obligatorios: descripcion, monto, categoria, medioPago, user_id'
        });
    }

    // 2. Validar que monto sea un número válido y mayor a cero
    const normalizedMonto = normalizeAmount(monto);
    if (isNaN(normalizedMonto) || normalizedMonto <= 0) {
        return res.status(400).json({ ok: false, error: 'Monto debe ser mayor a cero' });
    }

    // 3. Validar que categoria y medioPago sean números enteros válidos
    const categoriaNum = Number(categoria);
    const mediaNum = Number(medioPago);
    if (!Number.isInteger(categoriaNum) || !Number.isInteger(mediaNum) || categoriaNum <= 0 || mediaNum <= 0) {
        return res.status(400).json({ 
            ok: false, 
            error: 'categoria y medioPago deben ser IDs numéricos válidos y mayores a cero' 
        });
    }

    const fechaActual = new Date().toISOString().split('T')[0];
    const expenseData = {
        descripcion: descripcion.trim(),
        monto: normalizedMonto,
        categoria: categoriaNum.toString(),
        medioPago: mediaNum.toString(),
        fecha: fechaActual
    };

    const fingerprint = generateFingerprint(expenseData);

    try {
        if (isSupabaseConfigured) {
            // Verificar duplicados por fingerprint
            const { data: existing } = await supabase
                .from('gastos')
                .select('id')
                .eq('huella_digital', fingerprint)
                .maybeSingle();

            if (existing) {
                return res.json({ ok: true, created: false, duplicated: true, message: 'Gasto duplicado detectado' });
            }

            // Validar que user_id sea un UUID válido
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(user_id)) {
                return res.status(400).json({ ok: false, error: 'user_id debe ser un UUID válido' });
            }

            // Insertar en Supabase con fecha consistente
            const { data, error } = await supabase.from('gastos').insert([{
                user_id: user_id,
                descripcion: expenseData.descripcion.toUpperCase(),
                monto: expenseData.monto,
                id_categoria: categoriaNum,
                id_metodo_pago: mediaNum,
                fecha: `${fechaActual}T12:00:00Z`,
                es_fijo: false,
                huella_digital: fingerprint
            }]).select();

            if (error) throw error;
            res.status(201).json({ ok: true, created: true, duplicated: false, expense: data[0] });

        } else {
            // Modo Desarrollo (Simulado) — solo permitir si NO es producción
            if (isProduction) {
                return res.status(500).json({ ok: false, error: 'Supabase no configurado en producción' });
            }
            res.status(201).json({
                ok: true,
                message: 'Modo Mock: Gasto procesado (No persistido en DB)',
                data: expenseData
            });
        }
    } catch (error) {
        console.error('❌ Error en integración n8n:', error);
        res.status(500).json({ ok: false, error: error.message });
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
