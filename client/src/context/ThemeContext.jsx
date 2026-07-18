import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { getPerfilUsuario, updateThemeUsuario } from '../lib/db';
import { THEMES } from './themes';

const FALLBACK_THEME = 'light-azure';

const ThemeContext = createContext({});

export const ThemeProvider = ({ children }) => {
    const { session } = useAuth();

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

    // Cuando la sesión cambia (login/logout), sincroniza el theme desde Supabase
    useEffect(() => {
        if (!session) return;

        const sincronizarTheme = async () => {
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

        sincronizarTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]); // Solo re-sincronizar al cambiar de usuario, no en cada refresh de token

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

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);

// Re-exportamos THEMES para mantener compatibilidad con imports existentes
export { THEMES };
