import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';

/**
 * Página de aterrizaje (Welcome) para usuarios no autenticados.
 * Estética Glassmorphism con botón de Google Login.
 */
const Welcome = () => {
    const { session, signInWithGoogle, loading } = useAuth();

    console.log('🏠 Página Welcome - Sesión:', session ? 'Activa' : 'Inactiva', '| Cargando:', loading);

    // Si ya está logueado, redirigir al Dashboard
    if (session) {
        console.log('➡️ Usuario ya autenticado, redirigiendo a /');
        return <Navigate to="/" replace />;
    }

    return (
        <div className="welcome-page-body">
            {/* Navbar Branding Simplified */}
            <nav className="welcome-navbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '32px', color: 'white' }}>payments</span>
                    <span style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px', color: 'white' }}>Mis Gastos</span>
                </div>
            </nav>

            <main className="welcome-main">
                <div className="welcome-grid">
                    {/* LEFT SIDE: Magnetic Copy / Branding */}
                    <div className="welcome-hero-side">
                        <h1>
                            Control <br />
                            Inteligente
                        </h1>
                        <p>
                            Transforma la manera en que gestionas tu dinero.
                            Sin complicaciones, sin estrés. Simplemente el control que necesitas.
                        </p>
                        <div className="welcome-separator-line"></div>
                    </div>

                    {/* RIGHT SIDE: Login Card */}
                    <div className="welcome-card-login">
                        <div className="welcome-avatar-container">
                            <span className="material-symbols-outlined">person</span>
                        </div>



                        {/* Functional Google Sign In Button */}
                        <button
                            onClick={signInWithGoogle}
                            className="btn-pill-google pulse-animation"
                            disabled={loading}
                        >
                            <img
                                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                                alt="Google"
                                style={{ width: '20px', height: '20px' }}
                            />
                            <span>{loading ? 'Conectando...' : 'Iniciar con Google'}</span>
                        </button>

                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: 0 }}>
                            Acceso seguro garantizado por Google
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Welcome;
