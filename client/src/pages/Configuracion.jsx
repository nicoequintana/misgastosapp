import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme, THEMES } from '../context/ThemeContext';
import GlassCard from '../components/GlassCard';

/**
 * Página de configuración: perfil del usuario y selector de tema visual.
 */
const Configuracion = () => {
    const { user } = useAuth();
    const { themeId, applyTheme } = useTheme();

    const nombre = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuario';
    const email = user?.email || '—';
    const avatar = user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;
    const telefono = user?.user_metadata?.phone || null;

    const lightThemes = THEMES.filter(t => t.mode === 'light');
    const darkThemes = THEMES.filter(t => t.mode === 'dark');

    return (
        <div className="config-page">

            {/* ── PERFIL ─────────────────────────────── */}
            <GlassCard className="config-section">
                <div className="config-section-header">
                    <span className="material-symbols-outlined config-section-icon">person</span>
                    <h3 className="config-section-title">Perfil</h3>
                </div>

                <div className="profile-block">
                    <div className="profile-avatar-wrap">
                        <img src={avatar} alt={nombre} className="profile-avatar" />
                        <span className="profile-avatar-badge">
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>verified</span>
                        </span>
                    </div>

                    <div className="profile-info">
                        <p className="profile-name">{nombre}</p>
                        <p className="profile-email">{email}</p>
                        {telefono && <p className="profile-phone">{telefono}</p>}
                        <div className="profile-provider-badge">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            <span>Google Account</span>
                        </div>
                    </div>
                </div>
            </GlassCard>

            {/* ── TEMAS ──────────────────────────────── */}
            <GlassCard className="config-section">
                <div className="config-section-header">
                    <span className="material-symbols-outlined config-section-icon">palette</span>
                    <h3 className="config-section-title">Apariencia</h3>
                </div>

                <div className="theme-group">
                    <p className="theme-group-label">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>light_mode</span>
                        &nbsp;Modo claro
                    </p>
                    <div className="theme-grid">
                        {lightThemes.map(theme => (
                            <ThemeCard key={theme.id} theme={theme} active={themeId === theme.id} onSelect={applyTheme} />
                        ))}
                    </div>
                </div>

                <div className="theme-group">
                    <p className="theme-group-label">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>dark_mode</span>
                        &nbsp;Modo oscuro
                    </p>
                    <div className="theme-grid">
                        {darkThemes.map(theme => (
                            <ThemeCard key={theme.id} theme={theme} active={themeId === theme.id} onSelect={applyTheme} />
                        ))}
                    </div>
                </div>
            </GlassCard>

        </div>
    );
};

const ThemeCard = ({ theme, active, onSelect }) => (
    <button
        className={`theme-card ${active ? 'theme-card--active' : ''}`}
        onClick={() => onSelect(theme.id)}
        title={theme.label}
    >
        <div className="theme-card-preview">
            <div className="theme-swatch" style={{ background: theme.preview[1] }}>
                <div className="theme-swatch-accent" style={{ background: theme.preview[0] }} />
            </div>
        </div>
        <span className="theme-card-label">{theme.label}</span>
        {active && (
            <span className="theme-card-check">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
            </span>
        )}
    </button>
);

export default Configuracion;
