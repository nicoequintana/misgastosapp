import React, { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import WelcomeTour from '../components/WelcomeTour';
import NoveltyModal from '../components/NoveltyModal';
import { setSeo } from '../utils/seo';

// Funciones puras de pathname — se definen fuera del componente para evitar recrearlas en cada render
const getPageTitle = (path) => {
    switch (path) {
        case '/': return 'Dashboard';
        case '/movimientos': return 'Movimientos';
        case '/reportes': return 'Reportes';
        case '/presupuestos': return 'Presupuestos';
        case '/configuracion': return 'Configuración';
        default: return 'Tus Gastos';
    }
};

const getPageSeo = (path) => {
    switch (path) {
        case '/':
            return {
                title: 'Dashboard - Tus Gastos',
                description: 'Resumen financiero, ingresos y gastos fijos/variables en un solo lugar.'
            };
        case '/movimientos':
            return {
                title: 'Movimientos - Tus Gastos',
                description: 'Historial completo de gastos con búsqueda y filtros por categoría.'
            };
        case '/configuracion':
            return {
                title: 'Configuración - Tus Gastos',
                description: 'Perfil del usuario y personalización del tema visual.'
            };
        case '/reportes':
            return {
                title: 'Reportes - Tus Gastos',
                description: 'Analizá tus gastos por período con gráficos y rankings de categorías.'
            };
        case '/presupuestos':
            return {
                title: 'Presupuestos - Tus Gastos',
                description: 'Planificá gastos mensuales y mantené el control del presupuesto.'
            };
        case '/informes':
            return {
                title: 'Informes - Tus Gastos',
                description: 'Informes detallados para analizar tu comportamiento financiero.'
            };
        case '/ahorros':
            return {
                title: 'Ahorros - Tus Gastos',
                description: 'Seguimiento de metas y progreso de ahorro personal.'
            };
        default:
            return {
                title: 'Tus Gastos - Control Personal',
                description: 'Registrá gastos, analizá tus finanzas y tomá decisiones con claridad.'
            };
    }
};

/**
 * Esquema principal (Layout) de la aplicación.
 * Define la estructura común con Sidebar y Header, y utiliza Outlet para renderizar las páginas.
 * En mobile, el sidebar se reemplaza por un bottom nav bar.
 */
const MainLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 1024);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth > 1024);
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
            const mobile = window.innerWidth <= 1024;
            setIsMobile(mobile);
            if (mobile) {
                setIsSidebarOpen(false);
            } else {
                setIsSidebarOpen(true);
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

    React.useEffect(() => {
        setSeo(getPageSeo(location.pathname));
    }, [location.pathname]);

    return (
        <div className={`main-layout ${isMobile ? 'mobile' : ''} ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
            <WelcomeTour />
            <NoveltyModal />
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
                    <Outlet context={useMemo(() => ({ showNewExpense, setShowNewExpense }), [showNewExpense, setShowNewExpense])} />
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
