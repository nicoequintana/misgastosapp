import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/**
 * Componente de encabezado de la aplicación.
 * Muestra el título de la página actual, barra de búsqueda y perfil de usuario.
 * El toggle de tema alterna entre modo claro y oscuro manteniendo la paleta activa.
 */
const Header = ({ title, toggleSidebar, isMobile }) => {
    const { user } = useAuth();
    const { currentTheme, applyTheme, themes } = useTheme();
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

                <h2 style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
                    {title}
                </h2>

                <div className="search-container">
                    <span className="material-symbols-outlined" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '20px' }}>
                        search
                    </span>
                    <input
                        type="text"
                        placeholder="Buscar movimientos..."
                        className="search-input"
                    />
                </div>
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

                <button className="header-btn" title="Notificaciones">
                    <span className="material-symbols-outlined">notifications</span>
                    <span className="notification-dot"></span>
                </button>

                <div className="v-separator"></div>

                <div className="user-profile" onClick={() => navigate('/configuracion')} style={{ cursor: 'pointer' }} title="Ir a Configuración">
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
        </header>
    );
};

export default Header;
