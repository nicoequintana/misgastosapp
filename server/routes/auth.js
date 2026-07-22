const express = require('express');
const { supabaseAdmin } = require('../services/supabaseAdmin');

const router = express.Router();

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

module.exports = router;
