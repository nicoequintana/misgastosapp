import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

/**
 * Esquema principal (Layout) de la aplicación.
 * Define la estructura común con Sidebar y Header, y utiliza Outlet para renderizar las páginas.
 */
const MainLayout = () => {
    const location = useLocation();
    const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 1024);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(!isMobile);

    // Detectar cambios de tamaño de ventana
    React.useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth <= 1024;
            setIsMobile(mobile);
            if (!mobile) {
                setIsSidebarOpen(true);
            } else {
                setIsSidebarOpen(false);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Cerrar sidebar automáticamente al cambiar de ruta en mobile
    React.useEffect(() => {
        if (isMobile) {
            setIsSidebarOpen(false);
        }
    }, [location.pathname, isMobile]);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    /**
     * Mapea la ruta actual a un título amigable para el usuario.
     * @param {string} path - La ruta de la URL actual.
     * @returns {string} El título de la página.
     */
    const getPageTitle = (path) => {
        switch (path) {
            case '/': return 'Dashboard';
            case '/movimientos': return 'Movimientos';
            case '/presupuestos': return 'Presupuestos';
            case '/configuracion': return 'Configuración';
            default: return 'Mis Gastos';
        }
    };

    return (
        <div className={`main-layout ${isMobile ? 'mobile' : ''} ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
            <Sidebar isOpen={isSidebarOpen} isMobile={isMobile} toggleSidebar={toggleSidebar} />

            {/* Overlay para mobile cuando el sidebar está abierto */}
            {isMobile && isSidebarOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <div className="main-content-wrapper">
                <Header
                    title={getPageTitle(location.pathname)}
                    toggleSidebar={toggleSidebar}
                    isMobile={isMobile}
                />
                <main className="content-area">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
