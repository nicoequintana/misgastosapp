import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Variables obligatorias en cualquier entorno — nunca fallar silenciosamente
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'Error crítico: Faltan variables de entorno de Supabase.\n' +
        'Verificá que VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY estén configuradas en el archivo .env'
    );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    auth: {
        persistSession:   true,
        autoRefreshToken: true,
    },
});
