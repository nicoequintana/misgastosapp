import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useFondoOscuroAuth } from '../hooks/useFondoOscuroAuth';

/**
 * Paso 2 de recuperación de clave: ingresar el código de 6 dígitos con
 * countdown de expiración. Al vencer, deshabilita el input y ofrece
 * reenviar un código nuevo.
 */
const RecuperarClaveVerificar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const email = location.state?.email;
    useFondoOscuroAuth();

    const [codigo, setCodigo] = useState('');
    const [segundosRestantes, setSegundosRestantes] = useState(5 * 60);
    const [enviando, setEnviando] = useState(false);
    const [reenviando, setReenviando] = useState(false);
    const [error, setError] = useState('');

    // Sin email en el state (ej. refresh de página) no hay forma de continuar
    // el flujo — se vuelve a pedir el email desde cero.
    useEffect(() => {
        if (!email) {
            navigate('/recuperar-clave', { replace: true });
        }
    }, [email, navigate]);

    useEffect(() => {
        if (segundosRestantes <= 0) return;
        const intervalo = setInterval(() => {
            setSegundosRestantes((s) => Math.max(0, s - 1));
        }, 1000);
        return () => clearInterval(intervalo);
    }, [segundosRestantes]);

    const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setEnviando(true);
        try {
            const response = await fetch(`${backendUrl}/api/auth/recuperar/verificar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, codigo }),
            });
            const datos = await response.json();
            if (!datos.ok) {
                setError(datos.error || 'Código inválido o expirado.');
                return;
            }
            navigate('/recuperar-clave/nueva-password', {
                state: { email, resetToken: datos.resetToken },
            });
        } catch {
            setError('No se pudo conectar con el servidor. Intentá de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    const handleReenviar = useCallback(async () => {
        setError('');
        setReenviando(true);
        try {
            const response = await fetch(`${backendUrl}/api/auth/recuperar/solicitar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const datos = await response.json();
            if (datos.ok) {
                setSegundosRestantes(5 * 60);
                setCodigo('');
            } else {
                setError(datos.error || 'No se pudo reenviar el código.');
            }
        } catch {
            setError('No se pudo conectar con el servidor. Intentá de nuevo.');
        } finally {
            setReenviando(false);
        }
    }, [backendUrl, email]);

    if (!email) return null;

    const minutos = Math.floor(segundosRestantes / 60);
    const segundos = segundosRestantes % 60;
    const expirado = segundosRestantes <= 0;

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

                    <h2 className="welcome-registro-titulo">Ingresá el código</h2>
                    <p className="verificar-email-texto">
                        Te enviamos un código de 6 dígitos a {email}.
                    </p>

                    {!expirado ? (
                        <p className="verificar-email-nota">
                            Vence en {minutos}:{String(segundos).padStart(2, '0')}
                        </p>
                    ) : (
                        <p className="welcome-error">El código venció. Pedí uno nuevo.</p>
                    )}

                    <form onSubmit={handleSubmit} className="welcome-email-form">
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            placeholder="000000"
                            value={codigo}
                            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            required
                            disabled={enviando || expirado}
                            className="welcome-input"
                            autoComplete="one-time-code"
                            autoFocus
                        />

                        {error && <p className="welcome-error">{error}</p>}

                        <button
                            type="submit"
                            className="btn-pill-primary"
                            disabled={enviando || expirado || codigo.length !== 6}
                        >
                            {enviando ? 'Verificando...' : 'Verificar código'}
                        </button>
                    </form>

                    <p className="welcome-register-link">
                        <button
                            type="button"
                            className="welcome-link-btn"
                            onClick={handleReenviar}
                            disabled={reenviando}
                        >
                            {reenviando ? 'Reenviando...' : 'Reenviar código'}
                        </button>
                    </p>
                    <p className="welcome-register-link">
                        <Link to="/welcome" className="welcome-link">Volver al inicio de sesión</Link>
                    </p>
                </div>
                </div>
            </main>
        </div>
    );
};

export default RecuperarClaveVerificar;
