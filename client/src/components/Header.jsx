import React from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Componente de encabezado de la aplicación.
 * Muestra el título de la página actual, barra de búsqueda y perfil de usuario.
 * @param {string} title - El título a mostrar en el encabezado.
 */
const Header = ({ title, toggleSidebar, isMobile }) => {
    const { user } = useAuth();
    const [theme, setTheme] = React.useState(document.documentElement.getAttribute('data-theme') || 'light');

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('app-theme', newTheme);
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
                    onClick={toggleTheme}
                    className="header-btn"
                    title={theme === 'light' ? 'Activar Modo Oscuro' : 'Activar Modo Claro'}
                >
                    <span className="material-symbols-outlined">
                        {theme === 'light' ? 'dark_mode' : 'light_mode'}
                    </span>
                </button>

                <button className="header-btn" title="Notificaciones">
                    <span className="material-symbols-outlined">notifications</span>
                    <span className="notification-dot"></span>
                </button>

                <div className="v-separator"></div>

                <div className="user-profile">
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
