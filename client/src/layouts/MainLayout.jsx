import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { setSeo } from '../utils/seo';

/**
 * Esquema principal (Layout) de la aplicación.
 * Define la estructura común con Sidebar y Header, y utiliza Outlet para renderizar las páginas.
 * En mobile, el sidebar se reemplaza por un bottom nav bar.
 */
const MainLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 640);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(!isMobile);
    const [showNewExpense, setShowNewExpense] = React.useState(false);

    /**
     * Maneja el tap en el FAB de "Nuevo Gasto" del bottom nav.
     * Si el usuario no está en el dashboard, navega ahí primero y luego abre el modal.
     */
    const handleNewExpense = () => {
        if (location.pathname !== '/') {
            navigate('/');
        }
        setShowNewExpense(true);
    };

    // Detectar cambios de tamaño de ventana
    React.useEffect(() => {
        const handleResize = () => {
            // Mobile estricto: <= 640px activa el bottom nav
            const mobile = window.innerWidth <= 640;
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

    const getPageSeo = (path) => {
        switch (path) {
            case '/':
                return {
                    title: 'Dashboard - Mis Gastos',
                    description: 'Resumen financiero, ingresos y gastos fijos/variables en un solo lugar.'
                };
            case '/movimientos':
                return {
                    title: 'Movimientos - Mis Gastos',
                    description: 'Historial completo de gastos con búsqueda y filtros por categoría.'
                };
            case '/configuracion':
                return {
                    title: 'Configuración - Mis Gastos',
                    description: 'Perfil del usuario y personalización del tema visual.'
                };
            case '/presupuestos':
                return {
                    title: 'Presupuestos - Mis Gastos',
                    description: 'Planificá gastos mensuales y mantené el control del presupuesto.'
                };
            case '/informes':
                return {
                    title: 'Informes - Mis Gastos',
                    description: 'Informes detallados para analizar tu comportamiento financiero.'
                };
            case '/ahorros':
                return {
                    title: 'Ahorros - Mis Gastos',
                    description: 'Seguimiento de metas y progreso de ahorro personal.'
                };
            default:
                return {
                    title: 'Mis Gastos - Control Personal',
                    description: 'Registrá gastos, analizá tus finanzas y tomá decisiones con claridad.'
                };
        }
    };

    React.useEffect(() => {
        setSeo(getPageSeo(location.pathname));
    }, [location.pathname]);

    return (
        <div className={`main-layout ${isMobile ? 'mobile' : ''} ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
            <Sidebar
                isOpen={isSidebarOpen}
                isMobile={isMobile}
                toggleSidebar={toggleSidebar}
                onNewExpense={handleNewExpense}
            />

            {/* Overlay para mobile cuando el sidebar drawer está abierto */}
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
                {/* Área de contenido con padding inferior en mobile para el bottom nav */}
                <main className={`content-area ${isMobile ? 'content-area--mobile' : ''}`}>
                    <Outlet context={{ showNewExpense, setShowNewExpense }} />
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
