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
                                    <img
                                        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                                        alt="Google"
                                        className="wlc-google-logo"
                                    />
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
        </div>
    );
};

export default Welcome;
