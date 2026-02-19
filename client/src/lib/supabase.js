import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Inicializamos el cliente de Supabase
// Aseguramos que las variables de entorno estén presentes
if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Falta la URL o la Anon Key de Supabase. Verifica el archivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
