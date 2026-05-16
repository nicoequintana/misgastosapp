import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotificaciones } from '../context/NotificacionesContext';
import NotificacionesPanel from './NotificacionesPanel';

/**
 * Componente de encabezado de la aplicación.
 * Muestra el título de la página actual, toggle de tema, campana de notificaciones y perfil.
 */
const Header = ({ title, toggleSidebar, isMobile }) => {
    const { user } = useAuth();
    const { currentTheme, applyTheme, themes } = useTheme();
    const { noLeidas, togglePanel } = useNotificaciones();
    const navigate = useNavigate();

    // Alterna entre el tema claro y oscuro equivalente al activo
    const toggleMode = () => {
        const targetMode = currentTheme.mode === 'light' ? 'dark' : 'light';
        const equivalent = themes.find(t => t.mode === targetMode) ?? themes[0];
        applyTheme(equivalent.id);
    };

    return (
        <header className="header">
            <div className="header-left">
                {isMobile && (
                    <button onClick={toggleSidebar} className="header-btn" title="Menú">
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                )}
                <h2 className="header-title">
                    {title}
                </h2>
            </div>

            <div className="header-right">
                <button
                    onClick={toggleMode}
                    className="header-btn"
                    title={currentTheme.mode === 'light' ? 'Activar Modo Oscuro' : 'Activar Modo Claro'}
                >
                    <span className="material-symbols-outlined">
                        {currentTheme.mode === 'light' ? 'dark_mode' : 'light_mode'}
                    </span>
                </button>

                {/* Campana de notificaciones con badge de no leídas */}
                <button
                    className="header-btn notif-trigger-btn"
                    onClick={togglePanel}
                    title="Notificaciones"
                    aria-label={`Notificaciones${noLeidas > 0 ? `, ${noLeidas} sin leer` : ''}`}
                >
                    <span className="material-symbols-outlined">
                        {noLeidas > 0 ? 'notifications_active' : 'notifications'}
                    </span>
                    {noLeidas > 0 && (
                        <span className="notif-badge">
                            {noLeidas > 99 ? '99+' : noLeidas}
                        </span>
                    )}
                </button>

                <div className="v-separator"></div>

                <div
                    className="user-profile"
                    onClick={() => navigate('/configuracion')}
                    style={{ cursor: 'pointer' }}
                    title="Ir a Configuración"
                >
                    <div className="user-info-text">
                        <p className="user-name">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuario'}</p>
                        <p className="user-role">Cuenta Personal</p>
                    </div>
                    <div className="avatar-box">
                        <img
                            src={user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`}
                            alt="Profile"
                            className="avatar-img"
                        />
                    </div>
                </div>
            </div>

            {/* Panel de notificaciones — renderizado vía portal en modal-root */}
            <NotificacionesPanel />
        </header>
    );
};

export default Header;
