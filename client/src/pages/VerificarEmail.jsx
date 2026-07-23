import React from 'react';
import { Link } from 'react-router-dom';
import { useFondoOscuroAuth } from '../hooks/useFondoOscuroAuth';

/**
 * Pantalla de espera post-registro.
 * Supabase envía un email de confirmación; el usuario debe hacer click en el link
 * antes de poder iniciar sesión.
 */
const VerificarEmail = () => {
    useFondoOscuroAuth();
    return (
        <div className="wlc-root">
            <div className="wlc-bg" aria-hidden="true">
                <div className="wlc-orb wlc-orb--1" />
                <div className="wlc-orb wlc-orb--2" />
                <div className="wlc-orb wlc-orb--3" />
                <div className="wlc-orb wlc-orb--4" />
                <div className="wlc-grid-overlay" />
            </div>

            <nav className="wlc-nav">
                <div className="wlc-brand">
                    <div className="wlc-brand-icon">
                        <span className="material-symbols-outlined">payments</span>
                    </div>
                    <span className="wlc-brand-name">Tus Gastos</span>
                </div>
            </nav>

            <main className="wlc-main">
                <div className="wlc-card-wrap">
                <div className="wlc-card welcome-card-registro">
                    <div className="verificar-email-icon">
                        <span className="material-symbols-outlined">mark_email_unread</span>
                    </div>

                    <h2 className="welcome-registro-titulo">Revisá tu email</h2>

                    <p className="verificar-email-texto">
                        Te enviamos un link de confirmación. Hacé click en el link del email para activar tu cuenta.
                    </p>

                    <p className="verificar-email-nota">
                        Si no lo ves en unos minutos, revisá la carpeta de spam.
                    </p>

                    <Link to="/welcome" className="btn-pill-primary verificar-email-btn">
                        Volver al inicio
                    </Link>
                </div>
                </div>
            </main>
        </div>
    );
};

export default VerificarEmail;
