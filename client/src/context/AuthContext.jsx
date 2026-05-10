import React, { createContext, useContext, useEffect, useState } from 'react';
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
        // 1. Inicializar sesión — getSession() procesa el code OAuth de la URL antes de resolver,
        //    evitando que el redirect de Google llegue con user=null y mande a /welcome.
        const initializeAuth = async () => {
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error) {
                console.error('❌ Error al obtener sesión:', error.message);
            }

            setSession(session ?? null);
            setUser(session?.user ?? null);
            setLoading(false);
        };

        initializeAuth();

        // 2. Suscribirse a cambios de estado de autenticación
        // invitacionRedirigida evita que el hook SIGNED_IN (que Supabase puede disparar
        // múltiples veces por refrescos de token) ejecute la redirección más de una vez.
        let invitacionRedirigida = false;

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (import.meta.env.DEV) {
                console.log(`🔔 Evento de autenticación: ${event}`);
            }

            setSession(session);
            setUser(session?.user ?? null);
            // loading se setea solo en initializeAuth para evitar parpadeos por TOKEN_REFRESHED, etc.

            // Hook post-login: si hay una invitación pendiente, redirigir al link de aceptación.
            // AuthProvider vive fuera del Router, por lo que usamos window.location en lugar de useNavigate.
            // La bandera invitacionRedirigida evita el loop cuando Supabase re-emite SIGNED_IN.
            if (event === 'SIGNED_IN' && !invitacionRedirigida) {
                const tokenPendiente = localStorage.getItem('pending_invitation_token');
                if (tokenPendiente) {
                    invitacionRedirigida = true;
                    localStorage.removeItem('pending_invitation_token');
                    window.location.replace(`/grupos/invitaciones/${tokenPendiente}`);
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

    const signOut = async () => {
        // scope: 'global' invalida todos los tokens del usuario en todos los dispositivos.
        // Usar cuando se sospecha exposición de tokens (URL filtrada, sesión comprometida).
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (!error) {
            setUser(null);
            setSession(null);
        } else {
            console.error('❌ Error al cerrar sesión:', error.message);
        }
    };

    const value = {
        session,
        user,
        signOut,
        signInWithGoogle,
        loading
    };

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
