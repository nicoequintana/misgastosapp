import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getPerfilUsuario, updateThemeUsuario } from '../lib/db';

/**
 * Temas disponibles. Cada uno define modo (light/dark) y una paleta de colores.
 * El atributo data-theme se aplica en el <html> para activar las variables CSS.
 */
export const THEMES = [
    // ── MODO CLARO ──────────────────────────────────────────
    {
        id: 'light-azure',
        label: 'Azure',
        mode: 'light',
        preview: ['#137fec', '#e2f0fd', '#f8fafc'],
    },
    {
        id: 'light-sage',
        label: 'Sage',
        mode: 'light',
        preview: ['#059669', '#d1fae5', '#f0fdf9'],
    },
    {
        id: 'light-rose',
        label: 'Rose',
        mode: 'light',
        preview: ['#e11d48', '#ffe4e6', '#fff1f2'],
    },
    {
        id: 'light-violet',
        label: 'Violet',
        mode: 'light',
        preview: ['#7c3aed', '#ede9fe', '#f5f3ff'],
    },
    {
        id: 'light-amber',
        label: 'Amber',
        mode: 'light',
        preview: ['#d97706', '#fef3c7', '#fffbeb'],
    },
    {
        id: 'light-slate',
        label: 'Slate',
        mode: 'light',
        preview: ['#475569', '#e2e8f0', '#f8fafc'],
    },

    // ── MODO OSCURO ──────────────────────────────────────────
    {
        id: 'dark-ocean',
        label: 'Ocean',
        mode: 'dark',
        preview: ['#38bdf8', '#0c1a2e', '#0f2540'],
    },
    {
        id: 'dark-aurora',
        label: 'Aurora',
        mode: 'dark',
        preview: ['#34d399', '#0a1f1a', '#0d2b22'],
    },
    {
        id: 'dark-crimson',
        label: 'Crimson',
        mode: 'dark',
        preview: ['#fb7185', '#1f0a10', '#2d0d18'],
    },
    {
        id: 'dark-amethyst',
        label: 'Amethyst',
        mode: 'dark',
        preview: ['#a78bfa', '#120a2a', '#1a0f3a'],
    },
    {
        id: 'dark-gold',
        label: 'Gold',
        mode: 'dark',
        preview: ['#fbbf24', '#1a1200', '#261a00'],
    },
    {
        id: 'dark-carbon',
        label: 'Carbon',
        mode: 'dark',
        preview: ['#94a3b8', '#0d0d0d', '#1a1a1a'],
    },
];

const FALLBACK_THEME = 'light-azure';

const ThemeContext = createContext({});

export const ThemeProvider = ({ children }) => {
    // Arrancamos desde localStorage para evitar flash visual en el primer render.
    // Supabase sincroniza el valor real una vez que hay sesión.
    const [themeId, setThemeId] = useState(() => {
        return localStorage.getItem('app-theme-id') || FALLBACK_THEME;
    });

    const currentTheme = THEMES.find(t => t.id === themeId) ?? THEMES[0];

    // Aplica el tema al DOM y mantiene localStorage sincronizado
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', themeId);
        localStorage.setItem('app-theme-id', themeId);
        // Compatibilidad con el toggle legacy del Header
        localStorage.setItem('app-theme', currentTheme.mode);
    }, [themeId, currentTheme.mode]);

    // Al iniciar (o cuando cambia la sesión), carga el theme_id desde Supabase
    useEffect(() => {
        const sincronizarTheme = async (session) => {
            if (!session) return;

            try {
                const perfil = await getPerfilUsuario();
                if (perfil?.theme_id) {
                    setThemeId(perfil.theme_id);
                }
            } catch (err) {
                // Si falla (perfil no creado aún), el localStorage actúa de fallback
                console.warn('No se pudo cargar el theme desde Supabase:', err.message);
            }
        };

        // Verificar sesión activa al montar
        supabase.auth.getSession().then(({ data: { session } }) => {
            sincronizarTheme(session);
        });

        // Sincronizar cuando cambia el estado de autenticación
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            sincronizarTheme(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Cambia el tema localmente y lo persiste en Supabase
    const applyTheme = async (id) => {
        setThemeId(id);

        try {
            await updateThemeUsuario(id);
        } catch (err) {
            // Si no hay sesión activa o falla la red, el cambio ya quedó en localStorage
            console.warn('No se pudo guardar el theme en Supabase:', err.message);
        }
    };

    return (
        <ThemeContext.Provider value={{ themeId, currentTheme, applyTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
