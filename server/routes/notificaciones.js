const express = require('express');
const { procesarEnvioEmail } = require('../services/notificaciones');
const { getConfigUsuario } = require('../services/notificacionesDb');
const { supabaseAdmin } = require('../services/supabaseAdmin');

const router = express.Router();

/**
 * POST /api/notifications/email
 *
 * Recibe una notificación y despacha el email para el usuario autenticado
 * validado con Authorization: Bearer <access_token>.
 *
 * Body esperado:
 * {
 *   notificacion: { titulo, mensaje, tipo, origen, fecha_creacion, metadata }
 * }
 *
 * Respuesta exitosa:   { ok: true, emailEnviado: true }
 * Respuesta fallida:   { ok: true, emailEnviado: false, emailError: "..." }
 * Error de validación: { ok: false, error: "..." }
 */
router.post('/email', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { notificacion } = req.body;

    if (!notificacion || !notificacion.titulo || !notificacion.mensaje) {
        return res.status(400).json({
            ok: false,
            error: 'Faltan datos de la notificación (titulo, mensaje requeridos)',
        });
    }

    if (!token) {
        return res.status(401).json({
            ok: false,
            error: 'Falta el token de autenticación',
        });
    }

    try {
        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
        const user = userData?.user;

        if (userError || !user?.email) {
            return res.status(401).json({
                ok: false,
                error: 'No se pudo validar la sesión del usuario',
            });
        }

        const config = await getConfigUsuario(user.id);
        const { emailEnviado, emailError } = await procesarEnvioEmail(
            user.email,
            notificacion,
            config || {}
        );

        return res.json({ ok: true, emailEnviado, emailError });
    } catch (err) {
        // Error inesperado del servidor — nunca debe romper el flujo del cliente
        console.error('❌ Error inesperado en endpoint de email:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al procesar la solicitud' });
    }
});

module.exports = router;
