import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';

// Rutas lazy: se cargan solo cuando el usuario las visita
const Movements    = lazy(() => import('./pages/Movements'));
const Configuracion = lazy(() => import('./pages/Configuracion'));
const Reportes     = lazy(() => import('./pages/Reportes'));
const Grupos       = lazy(() => import('./pages/grupos/Grupos'));
const GrupoNuevo   = lazy(() => import('./pages/grupos/GrupoNuevo'));
const GrupoDetalle = lazy(() => import('./pages/grupos/GrupoDetalle'));
const GrupoGastoNuevo   = lazy(() => import('./pages/grupos/GrupoGastoNuevo'));
const GrupoGastoEditar  = lazy(() => import('./pages/grupos/GrupoGastoEditar'));
const AceptarInvitacion = lazy(() => import('./pages/grupos/AceptarInvitacion'));

import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificacionesProvider } from './context/NotificacionesContext';
import { AppReadyProvider, useAppReady } from './context/AppReadyContext';
import ProtectedRoute from './components/ProtectedRoute';
import Welcome from './pages/Welcome';
import AppLoader from './components/AppLoader';
import { useAuth } from './context/AuthContext';

/**
 * Componente principal de la aplicación.
 * Define la estructura de rutas mediante React Router y envuelve la aplicación en el MainLayout.
 */
const PageTransition = ({ children }) => (
  <div className="page-transition-enter">
    {children}
  </div>
);

/**
 * Wrapper interno que conecta el AppLoader con el estado de auth.
 * Debe vivir dentro de AuthProvider para poder usar useAuth().
 */
const AppWithLoader = () => {
  const { loading } = useAuth();
  const { appReady, setAppReady } = useAppReady();

  // En cuanto auth resuelve (con o sin usuario), la app puede mostrarse.
  // Cada página es responsable de su propio loading state interno.
  React.useEffect(() => {
    if (!loading) setAppReady(true);
  }, [loading, setAppReady]);

  // Mantiene el loader hasta que auth resuelva Y el primer fetch de datos termine
  return (
    <AppLoader loading={loading || !appReady}>
      <NotificacionesProvider>
        <Router>
          <Suspense fallback={<div className="grupos-page__loading"><div className="loading-spinner" /></div>}>
          <Routes>
            {/* Ruta pública */}
            <Route path="/welcome" element={<PageTransition><Welcome /></PageTransition>} />

            {/* Ruta pública: aceptar invitación — DEBE ir antes de /grupos/:id para evitar conflicto */}
            <Route path="/grupos/invitaciones/:token" element={<AceptarInvitacion />} />

            {/* Rutas Protegidas */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<PageTransition><Dashboard /></PageTransition>} />
                <Route path="movimientos" element={<PageTransition><Movements /></PageTransition>} />
                <Route path="configuracion" element={<PageTransition><Configuracion /></PageTransition>} />
                <Route path="reportes" element={<PageTransition><Reportes /></PageTransition>} />
                <Route path="presupuestos" element={<PageTransition><div style={{ padding: '24px', color: 'var(--text-main)' }}>Gastos Mensuales (Etapa 3)</div></PageTransition>} />
                <Route path="informes" element={<PageTransition><div style={{ padding: '24px', color: 'var(--text-main)' }}>Informes Detallados</div></PageTransition>} />
                <Route path="ahorros" element={<PageTransition><div style={{ padding: '24px', color: 'var(--text-main)' }}>Módulo de Ahorros</div></PageTransition>} />
                {/* Módulo de grupos de gastos compartidos */}
                <Route path="grupos" element={<PageTransition><Grupos /></PageTransition>} />
                <Route path="grupos/nuevo" element={<PageTransition><GrupoNuevo /></PageTransition>} />
                <Route path="grupos/:id" element={<PageTransition><GrupoDetalle /></PageTransition>} />
                <Route path="grupos/:id/gastos/nuevo" element={<PageTransition><GrupoGastoNuevo /></PageTransition>} />
                <Route path="grupos/:id/gastos/:gastoId/editar" element={<PageTransition><GrupoGastoEditar /></PageTransition>} />
                <Route path="grupos/:id/miembros" element={<PageTransition><GrupoDetalle defaultTab="miembros" /></PageTransition>} />
                <Route path="grupos/:id/saldos" element={<PageTransition><GrupoDetalle defaultTab="saldos" /></PageTransition>} />
              </Route>
            </Route>
          </Routes>
          </Suspense>
        </Router>
      </NotificacionesProvider>
    </AppLoader>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppReadyProvider>
          <AppWithLoader />
        </AppReadyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
