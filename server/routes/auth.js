const express = require('express');
const crypto = require('crypto');
const { supabaseAdmin } = require('../services/supabaseAdmin');
const { hashSha256, compararHash } = require('../utils');
const { enviarEmailCodigoRecuperacion } = require('../services/email');

const router = express.Router();

const MINUTOS_EXPIRACION_CODIGO = 5;
const MAX_INTENTOS_VERIFICACION = 5;

/**
 * Reglas de seguridad de contraseña de TusGastosApp — debe coincidir con
 * client/src/utils/validarPassword.js. Se revalida server-side porque no se
 * confía únicamente en la validación del cliente.
 */
const validarPasswordServer = (password) => {
    if (!password || password.length < 10) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    if (!/[^A-Za-z0-9]/.test(password)) return false;
    return true;
};

/**
 * Busca un usuario de auth.users por email, paginando listUsers() (la Admin
 * API no soporta filtro por email en esta versión del SDK — ver nota en
 * POST /existe-email más abajo).
 */
const buscarUsuarioPorEmail = async (email) => {
    const emailNormalizado = email.trim().toLowerCase();
    let page = 1;
    const perPage = 200;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;

        const encontrado = data.users.find((u) => u.email?.toLowerCase() === emailNormalizado);
        if (encontrado) return encontrado;

        if (data.users.length < perPage) return null;
        page += 1;
    }
};

/**
 * POST /api/auth/existe-email
 *
 * Verifica si un email ya está registrado en auth.users, ANTES de llamar a
 * supabase.auth.signUp() desde el frontend.
 *
 * Por qué hace falta: con "Confirm email" habilitado, signUp() nunca lanza
 * error si el email ya existe (para no filtrar registros) — pero en este
 * proyecto Supabase, además, genera un usuario NUEVO (id distinto) en cada
 * llamada repetida en vez de devolver el usuario original. El objeto user
 * resultante es indistinguible entre "email nuevo" y "email duplicado"
 * (mismo shape, created_at === updated_at en ambos casos), así que no hay
 * forma de detectar el duplicado DESPUÉS del signUp() — hay que chequear ANTES.
 *
 * listUsers() de la Admin API no soporta filtro por email en esta versión
 * del SDK (@supabase/supabase-js ^2.90), solo paginación — se pagina y
 * compara en memoria. Aceptable para el volumen actual de usuarios; si la
 * base crece mucho, migrar a una vista/función RPC que consulte auth.users
 * directamente vía SQL.
 *
 * Body: { email }
 * Respuesta: { ok: true, existe: boolean }
 */
router.post('/existe-email', async (req, res) => {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
        return res.status(400).json({ ok: false, error: 'Falta el email' });
    }

    const emailNormalizado = email.trim().toLowerCase();

    try {
        let existe = false;
        let page = 1;
        const perPage = 200;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
            if (error) throw error;

            if (data.users.some((u) => u.email?.toLowerCase() === emailNormalizado)) {
                existe = true;
                break;
            }

            if (data.users.length < perPage) break;
            page += 1;
        }

        return res.json({ ok: true, existe });
    } catch (err) {
        console.error('❌ Error al verificar existencia de email:', err.message);
        return res.status(500).json({ ok: false, error: 'Error al verificar el email' });
    }
});

/**
 * POST /api/auth/recuperar/solicitar
 *
 * Genera y envía un código de 6 dígitos para recuperar la contraseña.
 * Responde siempre igual, exista o no el email, para no filtrar qué emails
 * están registrados (mismo criterio que /existe-email intenta evitar del
 * lado del registro — acá es más sensible aún porque es un endpoint público
 * sin ningún control previo).
 *
 * Body: { email }
 * Respuesta: { ok: true, mensaje }
 */
router.post('/recuperar/solicitar', async (req, res) => {
    const { email } = req.body;
    const mensajeGenerico = 'Si el email está registrado, vas a recibir un código en breve.';

    if (!email || typeof email !== 'string') {
        return res.status(400).json({ ok: false, error: 'Falta el email' });
    }

    try {
        const usuario = await buscarUsuarioPorEmail(email);

        if (usuario) {
            const emailNormalizado = email.trim().toLowerCase();

            // Invalidar códigos previos no usados del mismo usuario.
            await supabaseAdmin
                .from('password_reset_codes')
                .update({ usado: true })
                .eq('user_id', usuario.id)
                .eq('usado', false);

            const codigo = crypto.randomInt(100000, 1000000).toString();
            const fechaExpiracion = new Date(Date.now() + MINUTOS_EXPIRACION_CODIGO * 60 * 1000).toISOString();

            const { error: insertError } = await supabaseAdmin.from('password_reset_codes').insert({
                user_id: usuario.id,
                email: emailNormalizado,
                codigo_hash: hashSha256(codigo),
                fecha_expiracion: fechaExpiracion,
            });
            if (insertError) throw insertError;

            const resultadoEmail = await enviarEmailCodigoRecuperacion(emailNormalizado, {
                codigo,
                minutosExpiracion: MINUTOS_EXPIRACION_CODIGO,
            });
            if (!resultadoEmail.ok) {
                console.error('⚠️ No se pudo enviar el email de código de recuperación:', resultadoEmail.error);
            }
        }

        return res.json({ ok: true, mensaje: mensajeGenerico });
    } catch (err) {
        console.error('❌ Error al solicitar código de recuperación:', err.message);
        // Igual respondemos genérico — no filtrar detalles del error al cliente.
        return res.json({ ok: true, mensaje: mensajeGenerico });
    }
});

/**
 * POST /api/auth/recuperar/verificar
 *
 * Valida el código de 6 dígitos contra el más reciente no usado y no
 * expirado para ese email. Si coincide, genera un token de un solo uso
 * (32 bytes) que habilita el paso de cambio de contraseña — evita reenviar
 * el código de 6 dígitos (baja entropía) como credencial de ese paso.
 *
 * Body: { email, codigo }
 * Respuesta OK: { ok: true, resetToken, expiraEn }
 * Respuesta error: { ok: false, error }
 */
router.post('/recuperar/verificar', async (req, res) => {
    const { email, codigo } = req.body;
    const errorGenerico = { ok: false, error: 'Código inválido o expirado' };

    if (!email || !codigo) {
        return res.status(400).json({ ok: false, error: 'Faltan datos' });
    }

    try {
        const emailNormalizado = email.trim().toLowerCase();

        const { data: filas, error } = await supabaseAdmin
            .from('password_reset_codes')
            .select('*')
            .eq('email', emailNormalizado)
            .eq('usado', false)
            .gt('fecha_expiracion', new Date().toISOString())
            .order('fecha_creacion', { ascending: false })
            .limit(1);
        if (error) throw error;

        const fila = filas?.[0];
        if (!fila) {
            return res.status(400).json(errorGenerico);
        }

        if (!compararHash(codigo, fila.codigo_hash)) {
            const nuevosIntentos = fila.intentos + 1;
            await supabaseAdmin
                .from('password_reset_codes')
                .update({
                    intentos: nuevosIntentos,
                    usado: nuevosIntentos >= MAX_INTENTOS_VERIFICACION,
                })
                .eq('id', fila.id);
            return res.status(400).json(errorGenerico);
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        await supabaseAdmin
            .from('password_reset_codes')
            .update({ verificado: true, reset_token_hash: hashSha256(resetToken) })
            .eq('id', fila.id);

        const expiraEn = Math.max(
            0,
            Math.floor((new Date(fila.fecha_expiracion).getTime() - Date.now()) / 1000)
        );

        return res.json({ ok: true, resetToken, expiraEn });
    } catch (err) {
        console.error('❌ Error al verificar código de recuperación:', err.message);
        return res.status(500).json({ ok: false, error: 'Error al verificar el código' });
    }
});

/**
 * POST /api/auth/recuperar/cambiar
 *
 * Cambia la contraseña usando el resetToken emitido en /verificar. Usa
 * supabaseAdmin.auth.admin.updateUserById porque el usuario no tiene sesión
 * activa en este punto del flujo — es el mecanismo correcto para forzar un
 * cambio de contraseña sin sesión, vía service role.
 *
 * Body: { email, resetToken, nuevaPassword }
 * Respuesta: { ok: true } | { ok: false, error }
 */
router.post('/recuperar/cambiar', async (req, res) => {
    const { email, resetToken, nuevaPassword } = req.body;
    const errorGenerico = { ok: false, error: 'Token inválido o expirado' };

    if (!email || !resetToken || !nuevaPassword) {
        return res.status(400).json({ ok: false, error: 'Faltan datos' });
    }

    if (!validarPasswordServer(nuevaPassword)) {
        return res.status(400).json({
            ok: false,
            error: 'La contraseña debe tener al menos 10 caracteres, una mayúscula, un número y un carácter especial.',
        });
    }

    try {
        const emailNormalizado = email.trim().toLowerCase();

        const { data: filas, error } = await supabaseAdmin
            .from('password_reset_codes')
            .select('*')
            .eq('email', emailNormalizado)
            .eq('verificado', true)
            .eq('usado', false)
            .gt('fecha_expiracion', new Date().toISOString())
            .order('fecha_creacion', { ascending: false })
            .limit(1);
        if (error) throw error;

        const fila = filas?.[0];
        if (!fila || !fila.reset_token_hash || !compararHash(resetToken, fila.reset_token_hash)) {
            return res.status(400).json(errorGenerico);
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(fila.user_id, {
            password: nuevaPassword,
        });
        if (updateError) throw updateError;

        await supabaseAdmin
            .from('password_reset_codes')
            .update({ usado: true })
            .eq('id', fila.id);

        return res.json({ ok: true });
    } catch (err) {
        console.error('❌ Error al cambiar contraseña:', err.message);
        return res.status(500).json({ ok: false, error: 'Error al cambiar la contraseña' });
    }
});

module.exports = router;
