import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext({});

/**
 * Proveedor de contexto para manejar la sesión de usuario de Supabase.
 */
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // onAuthStateChange dispara INITIAL_SESSION al montar (con sesión existente o null),
        // y también captura el code PKCE del callback OAuth antes de que getSession() lo vea.
        // Usarlo como fuente de verdad para setLoading(false) evita el race condition donde
        // getSession() resuelve con null antes de que el SDK intercambie el code OAuth.
        let invitacionRedirigida = false;

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (import.meta.env.DEV) {
                console.log(`🔔 Evento de autenticación: ${event}`);
            }

            setSession(session ?? null);
            setUser(session?.user ?? null);

            // INITIAL_SESSION es el primer evento — indica que auth ya resolvió
            if (event === 'INITIAL_SESSION') {
                setLoading(false);
            }

            // Hook post-login: si hay una invitación pendiente, redirigir al link de aceptación.
            // AuthProvider vive fuera del Router, por lo que usamos window.location en lugar de useNavigate.
            // La bandera invitacionRedirigida evita el loop cuando Supabase re-emite SIGNED_IN.
            if (event === 'SIGNED_IN' && !invitacionRedirigida) {
                const tokenPendiente = sessionStorage.getItem('pending_invitation_token');
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (tokenPendiente && uuidRegex.test(tokenPendiente)) {
                    invitacionRedirigida = true;
                    sessionStorage.removeItem('pending_invitation_token');
                    window.location.replace(`/grupos/invitaciones/${tokenPendiente}`);
                } else if (tokenPendiente) {
                    sessionStorage.removeItem('pending_invitation_token');
                }
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });
        if (error) {
            console.error('❌ Error al iniciar sesión con Google:', error.message);
            throw error;
        }
    };

    const signUpWithEmail = async ({ nombre, apellido, telefono, fechaNacimiento, email, password }) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/`,
            },
        });
        if (error) {
            console.error('❌ Error al registrarse:', error.message);
            throw error;
        }

        // Con confirmación de email pendiente, signUp() devuelve session=null pero
        // user con id — un array de identities vacío indica que el email ya existía
        // (Supabase no lanza error explícito en ese caso para no filtrar qué emails
        // están registrados).
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            throw new Error('User already registered');
        }

        if (data.user) {
            // RLS (auth.uid() = id) permite este insert porque el usuario recién
            // creado ya tiene un JWT válido, aunque su email no esté confirmado.
            const { error: perfilError } = await supabase.from('usuarios').upsert({
                id: data.user.id,
                nombre,
                apellido,
                telefono,
                fecha_nacimiento: fechaNacimiento,
            });
            if (perfilError) {
                // No revertimos el signUp — el perfil se puede completar después
                // desde Configuración.
                console.error('⚠️ Error al guardar perfil extendido:', perfilError.message);
            }
        }
    };

    const signInWithPassword = async ({ email, password }) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            console.error('❌ Error al iniciar sesión con contraseña:', error.message);
            throw error;
        }
    };

    const signOut = async () => {
        // scope: 'global' invalida todos los tokens del usuario en todos los dispositivos.
        // Usar cuando se sospecha exposición de tokens (URL filtrada, sesión comprometida).
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) {
            console.error('❌ Error al cerrar sesión:', error.message);
            throw error;
        }
        setUser(null);
        setSession(null);
    };

    const value = useMemo(
        () => ({ session, user, signOut, signInWithGoogle, signUpWithEmail, signInWithPassword, loading }),
        [session, user, loading] // el resto son referencias estables
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    return useContext(AuthContext);
};
