import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Componente Wrapper para proteger rutas que requieren autenticación.
 * Redirige a /welcome si el usuario no tiene una sesión activa.
 */
const ProtectedRoute = () => {
    const { session, loading } = useAuth();

    // Mientras auth resuelve, el AppLoader ya cubre la pantalla — no renderizar nada
    if (loading) return null;

    // Sin sesión → redirigir a welcome
    if (!session) {
        return <Navigate to="/welcome" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
