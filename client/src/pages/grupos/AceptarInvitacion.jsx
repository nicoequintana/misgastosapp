import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Página pública que maneja el flujo de aceptación de invitaciones a grupos.
 *
 * Flujo:
 * 1. Sin sesión → guarda el token en localStorage y redirige a /welcome para login.
 * 2. Con sesión → llama al backend para aceptar la invitación y redirige al grupo.
 *
 * La clave de localStorage es 'pending_invitation_token'.
 * AuthContext lee esa clave tras el login y redirige de vuelta aquí.
 */
const AceptarInvitacion = () => {
    const { token }  = useParams();
    const navigate   = useNavigate();
    const { session, loading } = useAuth();

    const [estado, setEstado]   = useState(() => (token ? 'cargando' : 'error'));
    const [mensaje, setMensaje] = useState(() => (token ? '' : 'Token de invitación no encontrado en la URL.'));

    // Garantiza que el efecto corre una sola vez cuando loading resuelve.
    // Sin esto, cada actualización de session (TOKEN_REFRESHED, SIGNED_IN) re-ejecuta el fetch.
    const procesado = useRef(false);

    useEffect(() => {
        // Esperar a que AuthContext resuelva la sesión inicial
        if (loading || !token || procesado.current) return;

        // Marcar inmediatamente para evitar re-ejecuciones por cambios en session
        procesado.current = true;

        const procesarInvitacion = async () => {
            // 1. Sin sesión → guardar token y redirigir a login
            if (!session?.access_token) {
                localStorage.setItem('pending_invitation_token', token);
                navigate('/welcome', { replace: true });
                return;
            }

            // 2. Con sesión → aceptar en el backend
            try {
                const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
                const response = await fetch(`${backendUrl}/api/grupos/invitaciones/aceptar`, {
                    method: 'POST',
                    headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ token }),
                });

                const datos = await response.json();

                if (!datos.ok) {
                    localStorage.removeItem('pending_invitation_token');
                    if (response.status === 410) {
                        setEstado('error');
                        setMensaje('Esta invitación ya venció. Pedile al admin del grupo que te reenvíe una nueva.');
                    } else if (response.status === 403) {
                        setEstado('error');
                        setMensaje('Esta invitación fue enviada a otro email. Iniciá sesión con el email correcto.');
                    } else {
                        setEstado('error');
                        setMensaje(datos.error || 'No se pudo aceptar la invitación. Intentá de nuevo más tarde.');
                    }
                    return;
                }

                // Éxito → navegar al grupo
                localStorage.removeItem('pending_invitation_token');
                navigate(`/grupos/${datos.grupo_id}`, { replace: true });

            } catch (err) {
                console.error('Error al aceptar invitación:', err);
                setEstado('error');
                setMensaje('Error de red. Verificá tu conexión e intentá de nuevo.');
            }
        };

        procesarInvitacion();
    }, [loading, token, session, navigate]);

    if (estado === 'cargando') {
        return (
            <div className="aceptar-invitacion">
                <div className="aceptar-invitacion__card glass-card">
                    <div className="loading-spinner" />
                    <p className="aceptar-invitacion__mensaje">Procesando tu invitación...</p>
                </div>
            </div>
        );
    }

    if (estado === 'exito') {
        return (
            <div className="aceptar-invitacion">
                <div className="aceptar-invitacion__card glass-card">
                    <span className="material-symbols-outlined aceptar-invitacion__icono aceptar-invitacion__icono--ok">
                        check_circle
                    </span>
                    <p className="aceptar-invitacion__mensaje">{mensaje}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="aceptar-invitacion">
            <div className="aceptar-invitacion__card glass-card">
                <span className="material-symbols-outlined aceptar-invitacion__icono aceptar-invitacion__icono--error">
                    error_outline
                </span>
                <p className="aceptar-invitacion__titulo">No se pudo aceptar la invitación</p>
                <p className="aceptar-invitacion__mensaje">{mensaje}</p>
                <button
                    className="btn btn-primary"
                    onClick={() => navigate('/')}
                >
                    Ir al inicio
                </button>
            </div>
        </div>
    );
};

export default AceptarInvitacion;
