import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight';

/**
 * Componente de modal genérico con efecto glassmorphism y animaciones de entrada/salida.
 * Utiliza React Portals para renderizarse fuera del flujo principal del DOM.
 * El overflow del body se restaura en el cleanup del effect, no en un setTimeout,
 * para garantizar que se ejecute aunque el componente se desmonte antes de que termine la animación.
 */
const Modal = ({ isOpen, onClose, title, subtitle, children, footer, disableClose = false }) => {
    const handleClose = (!disableClose && onClose) ? onClose : undefined;
    const [isVisible, setIsVisible] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const { height: viewportHeight, offsetTop: viewportOffsetTop } = useVisualViewportHeight();

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setIsVisible(true);
            setIsClosing(false);
        } else if (isVisible) {
            setIsClosing(true);
            const timer = setTimeout(() => {
                setIsVisible(false);
                setIsClosing(false);
            }, 300);
            return () => clearTimeout(timer);
        }
        // Cleanup: restaurar overflow cuando el modal se cierra o se desmonta,
        // sin importar si el timer llegó a ejecutarse o no.
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen, isVisible]);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!isVisible && !isOpen) return null;

    const overlayClass = isClosing ? 'modal-overlay closing' : 'modal-overlay';
    const contentClass = isClosing ? 'modal-content glass-card closing' : 'modal-content glass-card';

    // El overlay siempre cubre la pantalla completa (nunca se achica), para que el
    // fondo oscuro/blur tape el dashboard incluso con el teclado abierto. Es
    // .modal-content quien se ajusta al espacio real disponible: su max-height se
    // calcula a partir del viewport visual (que sí se reduce con el teclado) y se
    // reposiciona con marginTop para compensar el offsetTop que el teclado genera
    // en iOS/Chrome mobile (el layout viewport de este position:fixed no se mueve,
    // pero el viewport visual sí se desplaza hacia abajo).
    const contentStyle = viewportHeight
        ? { maxHeight: `${viewportHeight * 0.9}px`, marginTop: `${viewportOffsetTop}px` }
        : undefined;

    const modalContent = (
        <div className={overlayClass} onClick={handleClose}>
            <div className={contentClass} style={contentStyle} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        {title && <h3 className="modal-title">{title}</h3>}
                        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
                    </div>
                    {handleClose && (
                        <button className="modal-close" onClick={handleClose}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    )}
                </div>
                <div className="modal-body">
                    {children}
                </div>
                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(modalContent, document.getElementById('modal-root'));
};

export default Modal;
