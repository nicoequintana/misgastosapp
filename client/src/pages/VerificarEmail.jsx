import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Pantalla de espera post-registro.
 * Supabase envía un email de confirmación; el usuario debe hacer click en el link
 * antes de poder iniciar sesión.
 */
const VerificarEmail = () => {
    return (
        <div className="welcome-page-body">
            <nav className="welcome-navbar">
                <div className="welcome-navbar-brand">
                    <span className="material-symbols-outlined welcome-navbar-icon">payments</span>
                    <span className="welcome-navbar-title">Tus Gastos</span>
                </div>
            </nav>

            <main className="welcome-main">
                <div className="welcome-card-login">
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
            </main>
        </div>
    );
};

export default VerificarEmail;
