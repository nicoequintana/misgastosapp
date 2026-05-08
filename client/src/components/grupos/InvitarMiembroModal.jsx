import { useState } from 'react';
import Modal from '../Modal';
import { supabase } from '../../lib/supabase';

/**
 * Modal para invitar un nuevo miembro a un grupo por email.
 * Valida el formato del email en cliente antes de llamar al backend.
 * El endpoint del backend gestiona el envío del correo de invitación.
 *
 * @param {Object}   props
 * @param {string}   props.grupoId  - ID del grupo al que se invita
 * @param {boolean}  props.isOpen   - Controla la visibilidad del modal
 * @param {Function} props.onClose  - Callback al cerrar el modal
 * @param {Function} props.onExito  - Callback al enviar exitosamente la invitación
 */
const InvitarMiembroModal = ({ grupoId, isOpen, onClose, onExito }) => {
    const [email, setEmail]       = useState('');
    const [buscando, setBuscando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [enviandoRegistro, setEnviandoRegistro] = useState(false);
    const [error, setError]       = useState(null);
    const [exito, setExito]       = useState(null);
    const [resultadoBusqueda, setResultadoBusqueda] = useState(null);

    // Regex de validación de email (misma que usa el backend)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleCerrar = () => {
        // Limpiar estado al cerrar
        setEmail('');
        setBuscando(false);
        setError(null);
        setExito(null);
        setEnviando(false);
        setEnviandoRegistro(false);
        setResultadoBusqueda(null);
        onClose();
    };

    const obtenerTokenSesion = async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        return sessionData?.session?.access_token || null;
    };

    const buscarUsuario = async () => {
        setError(null);
        setExito(null);

        const emailNormalizado = email.trim();

        if (!emailNormalizado) {
            setError('El email es requerido.');
            return;
        }

        if (!emailRegex.test(emailNormalizado)) {
            setError('El formato del email no es válido.');
            return;
        }

        setBuscando(true);
        try {
            const token = await obtenerTokenSesion();
            if (!token) {
                setError('No se encontró tu sesión. Por favor recargá la página.');
                return;
            }

            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            const response = await fetch(
                `${backendUrl}/api/grupos/${grupoId}/usuarios/buscar?email=${encodeURIComponent(emailNormalizado)}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const datos = await response.json();
            if (!datos.ok) {
                setError(datos.error || 'No se pudo buscar el usuario.');
                setResultadoBusqueda(null);
                return;
            }

            setResultadoBusqueda(datos);
        } catch (err) {
            console.error('Error al buscar usuario:', err);
            setError('Error de red. Verificá tu conexión e intentá de nuevo.');
            setResultadoBusqueda(null);
        } finally {
            setBuscando(false);
        }
    };

    const handleEnviar = async (e) => {
        e.preventDefault();
        setError(null);
        setExito(null);

        const emailNormalizado = email.trim();

        // Validación client-side antes de llamar al backend
        if (!emailNormalizado) {
            setError('El email es requerido.');
            return;
        }

        if (!emailRegex.test(emailNormalizado)) {
            setError('El formato del email no es válido.');
            return;
        }

        if (!resultadoBusqueda?.registrado) {
            setError('Primero buscá el email para validar si el usuario ya está registrado.');
            return;
        }

        if (resultadoBusqueda?.yaEsMiembro) {
            setError('Ese usuario ya es miembro activo del grupo.');
            return;
        }

        setEnviando(true);

        try {
            // Obtener el JWT del usuario autenticado
            const token = await obtenerTokenSesion();

            if (!token) {
                setError('No se encontró tu sesión. Por favor recargá la página.');
                setEnviando(false);
                return;
            }

            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            const response = await fetch(`${backendUrl}/api/grupos/${grupoId}/invitaciones`, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ email: emailNormalizado }),
            });

            const datos = await response.json();

            if (!datos.ok) {
                // Traducir errores del backend a mensajes claros para el usuario
                setError(datos.error || 'No se pudo enviar la invitación.');
                setEnviando(false);
                return;
            }

            // Éxito: mostrar mensaje y notificar al padre
            setExito(`Invitación enviada a ${emailNormalizado}`);
            setEmail('');

            if (typeof onExito === 'function') {
                onExito();
            }
        } catch (err) {
            console.error('Error al enviar invitación:', err);
            setError('Error de red. Verificá tu conexión e intentá de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    const handleEnviarRegistro = async () => {
        setError(null);
        setExito(null);

        const emailNormalizado = email.trim();
        if (!emailRegex.test(emailNormalizado)) {
            setError('El formato del email no es válido.');
            return;
        }

        setEnviandoRegistro(true);
        try {
            const token = await obtenerTokenSesion();
            if (!token) {
                setError('No se encontró tu sesión. Por favor recargá la página.');
                return;
            }

            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            const response = await fetch(`${backendUrl}/api/grupos/${grupoId}/invitaciones/registro`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ email: emailNormalizado }),
            });

            const datos = await response.json();
            if (!datos.ok) {
                setError(datos.error || 'No se pudo enviar el email de registro.');
                return;
            }

            setExito(`Se envió un email de registro a ${emailNormalizado}`);
        } catch (err) {
            console.error('Error al enviar invitación de registro:', err);
            setError('Error de red. Verificá tu conexión e intentá de nuevo.');
        } finally {
            setEnviandoRegistro(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleCerrar}
            title="Invitar miembro"
            subtitle="Ingresá el email de la persona que querés invitar al grupo."
        >
            <form onSubmit={handleEnviar} className="invitar-modal__form">
                <div className="form-group">
                    <label htmlFor="email-invitacion" className="form-label">
                        Email
                    </label>
                    <input
                        id="email-invitacion"
                        type="email"
                        className="form-input"
                        placeholder="ejemplo@correo.com"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            setResultadoBusqueda(null);
                            // Limpiar errores al editar
                            if (error) setError(null);
                        }}
                        disabled={enviando || enviandoRegistro || buscando}
                        autoFocus
                        autoComplete="email"
                    />
                </div>

                <div className="invitar-modal__acciones invitar-modal__acciones--buscar">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={buscarUsuario}
                        disabled={enviando || enviandoRegistro || buscando || !email.trim()}
                    >
                        {buscando ? 'Buscando...' : 'Buscar usuario'}
                    </button>
                </div>

                {resultadoBusqueda && (
                    <div className="invitar-modal__resultado" role="status">
                        {resultadoBusqueda.registrado ? (
                            resultadoBusqueda.yaEsMiembro ? (
                                <>
                                    <span className="material-symbols-outlined">group</span>
                                    Este usuario ya es miembro activo del grupo.
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined">person_check</span>
                                    Usuario registrado: {resultadoBusqueda.usuario?.nombre || resultadoBusqueda.usuario?.email}
                                </>
                            )
                        ) : (
                            <>
                                <span className="material-symbols-outlined">person_off</span>
                                No está registrado. Podés enviarle un email para que se registre.
                            </>
                        )}
                    </div>
                )}

                {/* Mensaje de error */}
                {error && (
                    <div className="invitar-modal__error" role="alert">
                        <span className="material-symbols-outlined">error_outline</span>
                        {error}
                    </div>
                )}

                {/* Mensaje de éxito */}
                {exito && (
                    <div className="invitar-modal__exito" role="status">
                        <span className="material-symbols-outlined">check_circle</span>
                        {exito}
                    </div>
                )}

                <div className="invitar-modal__acciones">
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={handleCerrar}
                        disabled={enviando || enviandoRegistro || buscando}
                    >
                        Cancelar
                    </button>
                    {!resultadoBusqueda?.registrado && resultadoBusqueda && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleEnviarRegistro}
                            disabled={enviando || enviandoRegistro || buscando}
                        >
                            {enviandoRegistro ? 'Enviando registro...' : 'Enviar mail de registro'}
                        </button>
                    )}
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={
                            enviando ||
                            enviandoRegistro ||
                            buscando ||
                            !email.trim() ||
                            !resultadoBusqueda?.registrado ||
                            resultadoBusqueda?.yaEsMiembro
                        }
                    >
                        {enviando ? (
                            <>
                                <div className="loading-spinner loading-spinner--sm" />
                                Enviando...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">send</span>
                                Enviar invitación
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default InvitarMiembroModal;
