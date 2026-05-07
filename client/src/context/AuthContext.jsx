import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

/**
 * Proveedor de contexto para manejar la sesión de usuario de Supabase.
 */
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Obtener sesión activa al cargar la app
        const initializeAuth = async () => {
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error) {
                console.error('❌ Error al obtener sesión:', error.message);
            }

            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        };

        initializeAuth();

        // 2. Suscribirse a cambios de estado de autenticación
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (import.meta.env.DEV) {
                console.log(`🔔 Evento de autenticación: ${event}`);
            }

            setSession(session);
            setUser(session?.user ?? null);
            // loading se setea solo en initializeAuth para evitar parpadeos por TOKEN_REFRESHED, etc.
        });

        return () => subscription.unsubscribe();
    }, []);

    // Funciones de conveniencia
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
        const { error } = await supabase.auth.signOut();
        if (error) {
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
