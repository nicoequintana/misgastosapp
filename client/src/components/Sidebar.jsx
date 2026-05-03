import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Componente de barra lateral (Sidebar) para la navegación principal.
 * En mobile se reemplaza por una bottom nav bar con accesos directos.
 */
const Sidebar = ({ isOpen, isMobile, toggleSidebar, onNewExpense }) => {
    const { signOut } = useAuth();

    const menuItems = [
        { name: 'Resumen', icon: 'dashboard', path: '/' },
        { name: 'Movimientos', icon: 'history', path: '/movimientos' },
        { name: 'Reportes', icon: 'query_stats', path: '/reportes' },
        { name: 'Presupuestos', icon: 'account_balance_wallet', path: '/presupuestos', soon: true },
        { name: 'Informes', icon: 'bar_chart', path: '/informes', soon: true },
        { name: 'Ahorros', icon: 'savings', path: '/ahorros', soon: true },
        { name: 'Configuración', icon: 'settings', path: '/configuracion' },
    ];

    const handleLogout = async () => {
        await signOut();
    };

    return (
        <>
            {/* Sidebar lateral (desktop y drawer mobile) */}
            <aside className={`sidebar ${isOpen ? 'open' : 'closed'} ${isMobile ? 'mobile' : ''}`}>
                <div className="sidebar-logo">
                    <div className="logo-icon">
                        <span className="material-symbols-outlined">payments</span>
                    </div>
                    {isOpen && (
                        <div className="sidebar-logo-text">
                            <h1 className="sidebar-logo-title">Mis Gastos</h1>
                            <span className="sidebar-logo-sub">Finanzas Personales</span>
                        </div>
                    )}

                    {isMobile && (
                        <button onClick={toggleSidebar} className="header-btn" style={{ marginLeft: 'auto' }}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    )}
                </div>

                <nav className="sidebar-nav">
                    {menuItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''} ${item.soon ? 'nav-link--soon' : ''}`}
                            title={!isOpen ? item.name : ''}
                            onClick={isMobile ? toggleSidebar : undefined}
                        >
                            <span className="material-symbols-outlined">{item.icon}</span>
                            {isOpen && (
                                <>
                                    <span className="sidebar-text">{item.name}</span>
                                    {item.soon
                                        ? <span className="nav-soon-badge">Pronto</span>
                                        : <span className="material-symbols-outlined nav-chevron">chevron_right</span>
                                    }
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button
                        onClick={handleLogout}
                        className="nav-link logout-link"
                        title={!isOpen ? 'Cerrar Sesión' : ''}
                    >
                        <span className="material-symbols-outlined">logout</span>
                        {isOpen && <span className="sidebar-text">Cerrar Sesión</span>}
                    </button>
                </div>

                {isOpen && (
                    <div className="sidebar-credits">
                        <p className="credits-text">
                            Creado y desarrollado por
                            <br />
                            <strong>Nicolás Ezequiel Quintana</strong>
                            <br />
                            © 2026 Reservados todos los derechos.
                        </p>
                    </div>
                )}
            </aside>

            {/* Bottom Nav Bar — solo visible en mobile */}
            {isMobile && (
                <nav className="bottom-nav">
                    <NavLink to="/" className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
                        <span className="material-symbols-outlined">dashboard</span>
                        <span className="bottom-nav-label">Inicio</span>
                    </NavLink>

                    {/* Botón central FAB: Nuevo Gasto */}
                    <button className="bottom-nav-fab" onClick={onNewExpense} title="Nuevo Gasto">
                        <span className="material-symbols-outlined">add</span>
                    </button>
                    {/* Placeholder invisible para centrar el FAB en el grid */}
                    <div className="bottom-nav-fab-placeholder" aria-hidden="true" />

                    <button className="bottom-nav-item" onClick={toggleSidebar}>
                        <span className="material-symbols-outlined">menu</span>
                        <span className="bottom-nav-label">Menú</span>
                    </button>
                </nav>
            )}
        </>
    );
};

export default Sidebar;
