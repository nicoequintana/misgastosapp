import React, { createContext, useContext, useEffect, useState } from 'react';

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

const ThemeContext = createContext({});

export const ThemeProvider = ({ children }) => {
    const [themeId, setThemeId] = useState(() => {
        return localStorage.getItem('app-theme-id') || 'light-azure';
    });

    const currentTheme = THEMES.find(t => t.id === themeId) ?? THEMES[0];

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', themeId);
        // Compatibilidad con el toggle legacy que usaba 'light'/'dark'
        localStorage.setItem('app-theme', currentTheme.mode);
        localStorage.setItem('app-theme-id', themeId);
    }, [themeId, currentTheme.mode]);

    const applyTheme = (id) => setThemeId(id);

    return (
        <ThemeContext.Provider value={{ themeId, currentTheme, applyTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
