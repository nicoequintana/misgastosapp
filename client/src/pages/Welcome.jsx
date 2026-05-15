import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { setSeo } from '../utils/seo';

/**
 * Página de aterrizaje (Welcome) para usuarios no autenticados.
 * Fondo animado con orbs de plasma + glassmorphism en la card de login.
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
        <div className="wlc-root">
            {/* Orbs de fondo animados */}
            <div className="wlc-bg" aria-hidden="true">
                <div className="wlc-orb wlc-orb--1" />
                <div className="wlc-orb wlc-orb--2" />
                <div className="wlc-orb wlc-orb--3" />
                <div className="wlc-orb wlc-orb--4" />
                <div className="wlc-grid-overlay" />
            </div>

            {/* Navbar */}
            <nav className="wlc-nav">
                <div className="wlc-brand">
                    <div className="wlc-brand-icon">
                        <span className="material-symbols-outlined">payments</span>
                    </div>
                    <span className="wlc-brand-name">Tus Gastos</span>
                </div>
                <span className="wlc-agency">Quintech | Studio</span>
            </nav>

            {/* Layout principal */}
            <main className="wlc-main">
                <div className="wlc-layout">

                    {/* LEFT: Hero */}
                    <div className="wlc-hero">
                        <div className="wlc-eyebrow">
                            <span className="wlc-eyebrow-dot" />
                            Finanzas personales y de grupo
                        </div>

                        <h1 className="wlc-headline">
                            Tu dinero,<br />
                            <span className="wlc-headline-accent">bajo control.</span>
                        </h1>

                        <p className="wlc-subline">
                            Registrá gastos, analizá tus finanzas y tomá
                            decisiones con claridad. Simple, rápido, sin fricción.
                        </p>

                    </div>

                    {/* RIGHT: Card login */}
                    <div className="wlc-card-wrap">
                        <div className="wlc-card">
                            {/* Inner glow top */}
                            <div className="wlc-card-glow" aria-hidden="true" />

                            <div className="wlc-card-avatar">
                                <div className="wlc-avatar-inner">
                                    <span className="material-symbols-outlined">person</span>
                                </div>
                                <div className="wlc-avatar-ring" />
                            </div>

                            <div className="wlc-card-copy">
                                <h2 className="wlc-card-title">Bienvenido</h2>
                                <p className="wlc-card-subtitle">Ingresá con tu cuenta de Google para continuar.</p>
                            </div>

                            <button
                                onClick={signInWithGoogle}
                                className="wlc-btn-google"
                                disabled={loading}
                            >
                                {loading ? (
                                    <span className="wlc-spinner" />
                                ) : (
                                    <svg className="wlc-google-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">
                                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                                    </svg>
                                )}
                                <span>{loading ? 'Conectando...' : 'Iniciar con Google'}</span>
                            </button>

                            <p className="wlc-security-note">
                                <span className="material-symbols-outlined wlc-lock-icon">lock</span>
                                Acceso seguro garantizado por Google
                            </p>
                        </div>
                    </div>

                </div>
            </main>

            {/* Footer mobile — solo visible en mobile, crédito de agencia */}
            <footer className="wlc-footer-mobile">
                <span className="wlc-agency">Quintech | Studio</span>
            </footer>
        </div>
    );
};

export default Welcome;
