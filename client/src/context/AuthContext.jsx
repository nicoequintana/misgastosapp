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
            console.log('🔐 Inicializando autenticación...');
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error) {
                console.error('❌ Error al obtener sesión:', error.message);
            } else if (session) {
                console.log('✅ Sesión encontrada:', session.user.email);
            } else {
                console.log('ℹ️ No hay sesión activa');
            }

            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        };

        initializeAuth();

        // 2. Suscribirse a cambios de estado de autenticación
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`🔔 Evento de autenticación: ${event}`);

            if (session) {
                console.log('✅ Nueva sesión establecida:', session.user.email);
                console.log('👤 Datos del usuario:', {
                    nombre: session.user.user_metadata?.full_name,
                    email: session.user.email,
                    avatar: session.user.user_metadata?.avatar_url
                });
            } else {
                console.log('ℹ️ Sesión cerrada');
            }

            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Funciones de conveniencia
    const signInWithGoogle = async () => {
        console.log('🚀 Iniciando login con Google...');
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
        }
    };

    const signOut = async () => {
        console.log('👋 Cerrando sesión...');
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('❌ Error al cerrar sesión:', error.message);
        } else {
            console.log('✅ Sesión cerrada correctamente');
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
