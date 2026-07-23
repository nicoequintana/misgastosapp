import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFondoOscuroAuth } from '../hooks/useFondoOscuroAuth';

/**
 * Paso 1 de recuperación de clave: pide el email y solicita el código.
 * Responde siempre el mismo mensaje, exista o no el email, para no filtrar
 * qué emails están registrados (mismo criterio que el backend).
 */
const RecuperarClave = () => {
    const navigate = useNavigate();
    useFondoOscuroAuth();
    const [email, setEmail] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setEnviando(true);
        try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
            const response = await fetch(`${backendUrl}/api/auth/recuperar/solicitar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const datos = await response.json();
            if (!datos.ok) {
                setError(datos.error || 'No se pudo procesar la solicitud. Intentá de nuevo.');
                return;
            }
            navigate('/recuperar-clave/verificar', { state: { email } });
        } catch {
            setError('No se pudo conectar con el servidor. Intentá de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

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

                    <h2 className="welcome-registro-titulo">Recuperar contraseña</h2>
                    <p className="verificar-email-texto">
                        Ingresá tu email y te enviamos un código para restablecer tu contraseña.
                    </p>

                    <form onSubmit={handleSubmit} className="welcome-email-form">
                        <div className="welcome-field">
                            <label htmlFor="recuperar-email" className="welcome-input-label">Email</label>
                            <input
                                id="recuperar-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                disabled={enviando}
                                className="welcome-input"
                                autoComplete="email"
                                autoFocus
                            />
                        </div>

                        {error && <p className="welcome-error">{error}</p>}

                        <button
                            type="submit"
                            className="btn-pill-primary"
                            disabled={enviando}
                        >
                            {enviando ? 'Enviando...' : 'Enviar código'}
                        </button>
                    </form>

                    <p className="welcome-register-link">
                        <Link to="/welcome" className="welcome-link">Volver al inicio de sesión</Link>
                    </p>
                </div>
                </div>
            </main>
        </div>
    );
};

export default RecuperarClave;
