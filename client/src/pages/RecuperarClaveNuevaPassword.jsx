import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { validarPassword } from '../utils/validarPassword';
import { useFondoOscuroAuth } from '../hooks/useFondoOscuroAuth';

/**
 * Paso 3 de recuperación de clave: define la nueva contraseña usando el
 * resetToken emitido en el paso de verificación.
 */
const RecuperarClaveNuevaPassword = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const email = location.state?.email;
    const resetToken = location.state?.resetToken;
    useFondoOscuroAuth();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [enviando, setEnviando] = useState(false);

    // Sin resetToken en el state (ej. refresh de página) no hay forma de
    // continuar el flujo — se vuelve a pedir el email desde cero.
    useEffect(() => {
        if (!email || !resetToken) {
            navigate('/recuperar-clave', { replace: true });
        }
    }, [email, resetToken, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }
        const { valida, errores } = validarPassword(password);
        if (!valida) {
            setError(errores[0]);
            return;
        }

        setEnviando(true);
        try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
            const response = await fetch(`${backendUrl}/api/auth/recuperar/cambiar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, resetToken, nuevaPassword: password }),
            });
            const datos = await response.json();
            if (!datos.ok) {
                setError(datos.error || 'No se pudo cambiar la contraseña. Intentá de nuevo.');
                return;
            }
            navigate('/welcome', { replace: true });
        } catch {
            setError('No se pudo conectar con el servidor. Intentá de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    if (!email || !resetToken) return null;

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

                    <h2 className="welcome-registro-titulo">Nueva contraseña</h2>

                    <form onSubmit={handleSubmit} className="welcome-email-form">
                        <div className="welcome-field">
                            <label htmlFor="nueva-password" className="welcome-input-label">
                                Contraseña (mín. 10 caracteres, 1 mayúscula, 1 número, 1 especial)
                            </label>
                            <input
                                id="nueva-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={enviando}
                                className="welcome-input"
                                autoComplete="new-password"
                                autoFocus
                            />
                        </div>
                        <div className="welcome-field">
                            <label htmlFor="confirmar-nueva-password" className="welcome-input-label">Confirmar contraseña</label>
                            <input
                                id="confirmar-nueva-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                disabled={enviando}
                                className="welcome-input"
                                autoComplete="new-password"
                            />
                        </div>

                        {error && <p className="welcome-error">{error}</p>}

                        <button
                            type="submit"
                            className="btn-pill-primary"
                            disabled={enviando}
                        >
                            {enviando ? 'Guardando...' : 'Guardar contraseña'}
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

export default RecuperarClaveNuevaPassword;
