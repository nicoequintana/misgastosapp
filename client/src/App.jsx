import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Movements from './pages/Movements';
import Configuracion from './pages/Configuracion';
import Reportes from './pages/Reportes';

import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificacionesProvider } from './context/NotificacionesContext';
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

  return (
    <AppLoader loading={loading}>
      <NotificacionesProvider>
        <Router>
          <Routes>
            {/* Ruta Pública */}
            <Route path="/welcome" element={<PageTransition><Welcome /></PageTransition>} />

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
              </Route>
            </Route>
          </Routes>
        </Router>
      </NotificacionesProvider>
    </AppLoader>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppWithLoader />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
