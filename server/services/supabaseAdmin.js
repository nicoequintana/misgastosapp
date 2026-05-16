const { createClient } = require('@supabase/supabase-js');

/**
 * Cliente de Supabase con service role key.
 * Bypasea RLS — usar SOLO en el backend para operaciones del sistema
 * (como insertar notificaciones generadas por n8n).
 * NUNCA exponer este cliente ni esta key al frontend.
 *
 * Se inicializa de forma lazy para que dotenv ya haya cargado las variables
 * antes de que createClient las lea.
 */
let _client = null;

const supabaseAdmin = new Proxy({}, {
    get(_, prop) {
        if (!_client) {
            _client = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_SERVICE_ROLE_KEY
            );
        }
        const value = _client[prop];
        return typeof value === 'function' ? value.bind(_client) : value;
    }
});

module.exports = { supabaseAdmin };
