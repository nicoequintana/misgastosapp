import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validar que las variables de entorno sean obligatorias
if (!supabaseUrl || !supabaseAnonKey) {
    const mensaje = 'Error crítico: Faltan variables de entorno de Supabase.\nVerifica que VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY estén configuradas en el archivo .env';
    console.error(mensaje);
    // En desarrollo, lanzar error para evitar operaciones fallidas silenciosas
    if (import.meta.env.DEV) {
        throw new Error(mensaje);
    }
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
