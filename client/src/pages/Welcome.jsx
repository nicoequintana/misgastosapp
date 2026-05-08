import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { setSeo } from '../utils/seo';

/**
 * Página de aterrizaje (Welcome) para usuarios no autenticados.
 * Estética Glassmorphism con botón de Google Login.
 */
const Welcome = () => {
    const { session, signInWithGoogle, loading } = useAuth();

    React.useEffect(() => {
        setSeo({
            title: 'Bienvenido - Tus Gastos',
            description: 'Ingresá con Google para registrar tus gastos y ordenar tus finanzas.'
        });
    }, []);

    if (session) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="welcome-page-body">
            <nav className="welcome-navbar">
                <div className="welcome-navbar-brand">
                    <span className="material-symbols-outlined welcome-navbar-icon">payments</span>
                    <span className="welcome-navbar-title">Tus Gastos</span>
                </div>
            </nav>

            <main className="welcome-main">
                <div className="welcome-grid">
                    {/* LEFT SIDE: Branding */}
                    <div className="welcome-hero-side">
                        <h1>
                            Tu dinero,<br />
                            bajo control.
                        </h1>
                        <p>
                            Registrá gastos, analizá tus finanzas y tomá decisiones con claridad.
                            Simple, rápido, sin fricción.
                        </p>
                        <div className="welcome-separator-line"></div>
                    </div>

                    {/* RIGHT SIDE: Login Card */}
                    <div className="welcome-card-login">
                        <div className="welcome-avatar-container">
                            <span className="material-symbols-outlined">person</span>
                        </div>

                        <button
                            onClick={signInWithGoogle}
                            className="btn-pill-google pulse-animation"
                            disabled={loading}
                        >
                            <img
                                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                                alt="Google"
                                className="welcome-google-logo"
                            />
                            <span>{loading ? 'Conectando...' : 'Iniciar con Google'}</span>
                        </button>

                        <p className="welcome-security-note">
                            Acceso seguro garantizado por Google
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Welcome;
