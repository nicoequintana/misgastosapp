

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Movements from './pages/Movements';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Welcome from './pages/Welcome';

/**
 * Componente principal de la aplicación.
 * Define la estructura de rutas mediante React Router y envuelve la aplicación en el MainLayout.
 */
const PageTransition = ({ children }) => (
  <div className="page-transition-enter">
    {children}
  </div>
);

function App() {
  React.useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Ruta Pública */}
          <Route path="/welcome" element={<PageTransition><Welcome /></PageTransition>} />

          {/* Rutas Protegidas */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<PageTransition><Dashboard /></PageTransition>} />
              <Route path="movimientos" element={<PageTransition><Movements /></PageTransition>} />
              <Route path="presupuestos" element={<PageTransition><div style={{ padding: '24px', color: 'var(--text-main)' }}>Gastos Mensuales (Etapa 3)</div></PageTransition>} />
              <Route path="informes" element={<PageTransition><div style={{ padding: '24px', color: 'var(--text-main)' }}>Informes Detallados</div></PageTransition>} />
              <Route path="ahorros" element={<PageTransition><div style={{ padding: '24px', color: 'var(--text-main)' }}>Módulo de Ahorros</div></PageTransition>} />
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
