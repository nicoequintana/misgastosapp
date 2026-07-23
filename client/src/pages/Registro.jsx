import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { validarPassword } from '../utils/validarPassword';
import { useFondoOscuroAuth } from '../hooks/useFondoOscuroAuth';

/**
 * Página de registro con email y contraseña.
 * Solicita nombre, apellido, teléfono, fecha de nacimiento, email y contraseña.
 * La foto de perfil se carga desde Configuración una vez dentro de la app.
 * Tras el registro redirige a /verificar-email (el acceso requiere confirmación).
 */
const Registro = () => {
    const { session, signUpWithEmail, loading } = useAuth();
    const navigate = useNavigate();
    useFondoOscuroAuth();

    const [nombre, setNombre] = useState('');
    const [apellido, setApellido] = useState('');
    const [telefono, setTelefono] = useState('');
    const [fechaNacimiento, setFechaNacimiento] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [enviando, setEnviando] = useState(false);

    if (session) {
        return <Navigate to="/" replace />;
    }

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
            await signUpWithEmail({ nombre, apellido, telefono, fechaNacimiento, email, password });
            navigate('/verificar-email', { replace: true });
        } catch (err) {
            if (err.message?.includes('already registered') || err.message?.includes('User already registered')) {
                setError('Ya existe una cuenta con ese email. Si te registraste con Google, ingresá por ahí.');
            } else {
                setError(err.message || 'Error al registrarse. Intentá de nuevo.');
            }
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

                    <h2 className="welcome-registro-titulo">Crear cuenta</h2>

                    <form onSubmit={handleSubmit} className="welcome-email-form">
                        <div className="welcome-field">
                            <label htmlFor="nombre" className="welcome-input-label">Nombre</label>
                            <input
                                id="nombre"
                                type="text"
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                required
                                disabled={enviando}
                                className="welcome-input"
                                autoComplete="given-name"
                                autoFocus
                            />
                        </div>
                        <div className="welcome-field">
                            <label htmlFor="apellido" className="welcome-input-label">Apellido</label>
                            <input
                                id="apellido"
                                type="text"
                                value={apellido}
                                onChange={(e) => setApellido(e.target.value)}
                                required
                                disabled={enviando}
                                className="welcome-input"
                                autoComplete="family-name"
                            />
                        </div>
                        <div className="welcome-field">
                            <label htmlFor="telefono" className="welcome-input-label">Teléfono</label>
                            <input
                                id="telefono"
                                type="tel"
                                value={telefono}
                                onChange={(e) => setTelefono(e.target.value)}
                                required
                                disabled={enviando}
                                className="welcome-input"
                                autoComplete="tel"
                            />
                        </div>
                        <div className="welcome-field">
                            <label htmlFor="fecha-nacimiento" className="welcome-input-label">Fecha de nacimiento</label>
                            <input
                                id="fecha-nacimiento"
                                type="date"
                                value={fechaNacimiento}
                                onChange={(e) => setFechaNacimiento(e.target.value)}
                                required
                                disabled={enviando}
                                className="welcome-input"
                                autoComplete="bday"
                                max={new Date().toISOString().split('T')[0]}
                                data-has-value={fechaNacimiento ? 'true' : 'false'}
                            />
                        </div>
                        <div className="welcome-field">
                            <label htmlFor="email" className="welcome-input-label">Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                disabled={enviando}
                                className="welcome-input"
                                autoComplete="email"
                            />
                        </div>
                        <div className="welcome-field">
                            <label htmlFor="password" className="welcome-input-label">
                                Contraseña (mín. 10 caracteres, 1 mayúscula, 1 número, 1 especial)
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={enviando}
                                className="welcome-input"
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="welcome-field">
                            <label htmlFor="confirm-password" className="welcome-input-label">Confirmar contraseña</label>
                            <input
                                id="confirm-password"
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
                            disabled={enviando || loading}
                        >
                            {enviando ? 'Creando cuenta...' : 'Crear cuenta'}
                        </button>
                    </form>

                    <p className="welcome-register-link">
                        ¿Ya tenés cuenta?{' '}
                        <Link to="/welcome" className="welcome-link">Iniciar sesión</Link>
                    </p>
                </div>
                </div>
            </main>
        </div>
    );
};

export default Registro;
