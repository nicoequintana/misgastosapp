import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Componente Wrapper para proteger rutas que requieren autenticación.
 * Redirige a /welcome si el usuario no tiene una sesión activa.
 */
const ProtectedRoute = () => {
    const { session, loading } = useAuth();

    // Mostrar loader mientras se verifica la sesión
    if (loading) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--app-bg)',
                flexDirection: 'column',
                gap: '16px'
            }}>
                <div className="loader"></div>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Verificando sesión...</p>
            </div>
        );
    }

    // Si no hay sesión, redirigir a welcome
    if (!session) {
        console.log('⚠️ No hay sesión, redirigiendo a /welcome');
        return <Navigate to="/welcome" replace />;
    }

    // Si hay sesión, mostrar el contenido protegido
    console.log('✅ Sesión válida, mostrando contenido protegido');
    return <Outlet />;
};

export default ProtectedRoute;
