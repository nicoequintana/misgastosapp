import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { validarPassword } from '../utils/validarPassword';

/**
 * Página de registro con email y contraseña.
 * Solicita nombre, apellido, teléfono, fecha de nacimiento, email y contraseña.
 * La foto de perfil se carga desde Configuración una vez dentro de la app.
 * Tras el registro redirige a /verificar-email (el acceso requiere confirmación).
 */
const Registro = () => {
    const { session, signUpWithEmail, loading } = useAuth();
    const navigate = useNavigate();

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
        <div className="welcome-page-body">
            <nav className="welcome-navbar">
                <div className="welcome-navbar-brand">
                    <span className="material-symbols-outlined welcome-navbar-icon">payments</span>
                    <span className="welcome-navbar-title">Tus Gastos</span>
                </div>
            </nav>

            <main className="welcome-main">
                <div className="welcome-card-login welcome-card-registro">

                    <h2 className="welcome-registro-titulo">Crear cuenta</h2>

                    <form onSubmit={handleSubmit} className="welcome-email-form">
                        <input
                            type="text"
                            placeholder="Nombre"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            required
                            disabled={enviando}
                            className="welcome-input"
                            autoComplete="given-name"
                            autoFocus
                        />
                        <input
                            type="text"
                            placeholder="Apellido"
                            value={apellido}
                            onChange={(e) => setApellido(e.target.value)}
                            required
                            disabled={enviando}
                            className="welcome-input"
                            autoComplete="family-name"
                        />
                        <input
                            type="tel"
                            placeholder="Teléfono"
                            value={telefono}
                            onChange={(e) => setTelefono(e.target.value)}
                            required
                            disabled={enviando}
                            className="welcome-input"
                            autoComplete="tel"
                        />
                        <input
                            type="date"
                            placeholder="Fecha de nacimiento"
                            value={fechaNacimiento}
                            onChange={(e) => setFechaNacimiento(e.target.value)}
                            required
                            disabled={enviando}
                            className="welcome-input"
                            autoComplete="bday"
                            max={new Date().toISOString().split('T')[0]}
                        />
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={enviando}
                            className="welcome-input"
                            autoComplete="email"
                        />
                        <input
                            type="password"
                            placeholder="Contraseña (mín. 10 caracteres, 1 mayúscula, 1 número, 1 especial)"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={enviando}
                            className="welcome-input"
                            autoComplete="new-password"
                        />
                        <input
                            type="password"
                            placeholder="Confirmar contraseña"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            disabled={enviando}
                            className="welcome-input"
                            autoComplete="new-password"
                        />

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
            </main>
        </div>
    );
};

export default Registro;
