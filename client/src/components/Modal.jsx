import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Componente de modal genérico con efecto glassmorphism y animaciones de entrada/salida.
 * Utiliza React Portals para renderizarse fuera del flujo principal del DOM.
 */
const Modal = ({ isOpen, onClose, title, subtitle, children }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            setIsClosing(false);
            document.body.style.overflow = 'hidden';
        } else if (isVisible) {
            setIsClosing(true);
            const timer = setTimeout(() => {
                setIsVisible(false);
                setIsClosing(false);
                document.body.style.overflow = 'auto';
            }, 300);
            return () => clearTimeout(timer);
        }

        return () => {
            document.body.style.overflow = 'auto';
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
