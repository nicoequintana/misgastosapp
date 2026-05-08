/**
 * Temas disponibles. Cada uno define modo (light/dark) y una paleta de colores.
 * El atributo data-theme se aplica en el <html> para activar las variables CSS.
 */
export const THEMES = [
    // ── MODO CLARO ──────────────────────────────────────────
    { id: 'light-azure',   label: 'Azure',     mode: 'light', preview: ['#137fec', '#e2f0fd', '#f8fafc'] },
    { id: 'light-sage',    label: 'Sage',      mode: 'light', preview: ['#059669', '#d1fae5', '#f0fdf9'] },
    { id: 'light-rose',    label: 'Rose',      mode: 'light', preview: ['#e11d48', '#ffe4e6', '#fff1f2'] },
    { id: 'light-violet',  label: 'Violet',    mode: 'light', preview: ['#7c3aed', '#ede9fe', '#f5f3ff'] },
    { id: 'light-amber',   label: 'Amber',     mode: 'light', preview: ['#d97706', '#fef3c7', '#fffbeb'] },
    { id: 'light-slate',   label: 'Slate',     mode: 'light', preview: ['#475569', '#e2e8f0', '#f8fafc'] },
    { id: 'light-coral',   label: 'Coral',     mode: 'light', preview: ['#ff4757', '#ff6b81', '#fff0f2'] },
    { id: 'light-mint',    label: 'Mint',      mode: 'light', preview: ['#00c896', '#00e5ad', '#edfff9'] },
    { id: 'light-peach',   label: 'Peach',     mode: 'light', preview: ['#ff7043', '#ffab76', '#fff8f5'] },

    // ── MODO OSCURO ──────────────────────────────────────────
    { id: 'dark-ocean',    label: 'Ocean',     mode: 'dark',  preview: ['#38bdf8', '#0c1a2e', '#0f2540'] },
    { id: 'dark-aurora',   label: 'Aurora',    mode: 'dark',  preview: ['#34d399', '#0a1f1a', '#0d2b22'] },
    { id: 'dark-crimson',  label: 'Crimson',   mode: 'dark',  preview: ['#fb7185', '#1f0a10', '#2d0d18'] },
    { id: 'dark-amethyst', label: 'Amethyst',  mode: 'dark',  preview: ['#a78bfa', '#120a2a', '#1a0f3a'] },
    { id: 'dark-gold',     label: 'Gold',      mode: 'dark',  preview: ['#fbbf24', '#1a1200', '#261a00'] },
    { id: 'dark-carbon',   label: 'Carbon',    mode: 'dark',  preview: ['#94a3b8', '#0d0d0d', '#1a1a1a'] },
    { id: 'dark-neon',     label: 'Neon',      mode: 'dark',  preview: ['#39ff14', '#0a0f0a', '#001a00'] },
    { id: 'dark-volcanic', label: 'Volcanic',  mode: 'dark',  preview: ['#ff6600', '#1a0500', '#2d0d00'] },
    { id: 'dark-midnight', label: 'Midnight',  mode: 'dark',  preview: ['#818cf8', '#06071a', '#0d1033'] },
];
