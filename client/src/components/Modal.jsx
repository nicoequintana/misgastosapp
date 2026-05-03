import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Contador global para rastrear modales abiertos (evita toggle bugs con múltiples modales)
let modalOpenCount = 0;

/**
 * Componente de modal genérico con efecto glassmorphism y animaciones de entrada/salida.
 * Utiliza React Portals para renderizarse fuera del flujo principal del DOM.
 * Maneja correctamente overflow con patrón de contador para múltiples modales simultáneos.
 */
const Modal = ({ isOpen, onClose, title, subtitle, children }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const modalCountRef = useRef(null);

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isOpen) {
            // Al abrir: incrementar contador y ocultar scroll del body
            if (modalOpenCount === 0) {
                document.body.style.overflow = 'hidden';
            }
            modalOpenCount += 1;
            modalCountRef.current = modalOpenCount;

            setIsVisible(true);
            setIsClosing(false);
        } else if (isVisible) {
            // Al cerrar: iniciar animación
            setIsClosing(true);
            const timer = setTimeout(() => {
                setIsVisible(false);
                setIsClosing(false);

                // Solo restaurar overflow si este es el último modal abierto
                if (modalCountRef.current === modalOpenCount) {
                    modalOpenCount -= 1;
                    if (modalOpenCount === 0) {
                        document.body.style.overflow = 'auto';
                    }
                }
            }, 300);
            return () => clearTimeout(timer);
        }

        return () => {
            // Cleanup: asegurar que no queda overflow oculto
            if (modalOpenCount === 0) {
                document.body.style.overflow = 'auto';
            }
        };
    }, [isOpen, isVisible]);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!isVisible && !isOpen) return null;

    const overlayClass = isClosing ? 'modal-overlay closing' : 'modal-overlay';
    const contentClass = isClosing ? 'modal-content glass-card closing' : 'modal-content glass-card';

    const modalContent = (
        <div className={overlayClass} onClick={onClose}>
            <div className={contentClass} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        {title && <h3 className="modal-title">{title}</h3>}
                        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.getElementById('modal-root'));
};

export default Modal;
