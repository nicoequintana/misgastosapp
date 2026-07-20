import { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight';

const SELECTOR_ENFOCABLES = 'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])';

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
    const contentRef = useRef(null);
    const triggerElementRef = useRef(null);
    const titleId = useId();

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

    // Foco: al abrir, guardamos el elemento disparador y movemos el foco dentro
    // del modal (primer elemento enfocable, o el propio contenido si no hay ninguno).
    // Al cerrar, devolvemos el foco al disparador — sin esto, un usuario de teclado
    // queda "perdido" en el body detrás del modal (WCAG 2.4.3).
    useEffect(() => {
        if (!isOpen) return;
        triggerElementRef.current = document.activeElement;

        const primerEnfocable = contentRef.current?.querySelector(SELECTOR_ENFOCABLES);
        (primerEnfocable || contentRef.current)?.focus();

        return () => {
            triggerElementRef.current?.focus?.();
        };
    }, [isOpen]);

    // Escape cierra el modal (salvo disableClose) y Tab queda atrapado dentro del
    // contenido (focus trap) para que un usuario de teclado no salga al dashboard
    // que sigue detrás del overlay.
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleClose?.();
                return;
            }
            if (e.key !== 'Tab' || !contentRef.current) return;

            const enfocables = contentRef.current.querySelectorAll(SELECTOR_ENFOCABLES);
            if (enfocables.length === 0) return;
            const primero = enfocables[0];
            const ultimo = enfocables[enfocables.length - 1];

            if (e.shiftKey && document.activeElement === primero) {
                e.preventDefault();
                ultimo.focus();
            } else if (!e.shiftKey && document.activeElement === ultimo) {
                e.preventDefault();
                primero.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleClose]);

    if (!isVisible && !isOpen) return null;

    const overlayClass = isClosing ? 'modal-overlay closing' : 'modal-overlay';
    const contentClass = isClosing ? 'modal-content glass-card closing' : 'modal-content glass-card';

    // El overlay siempre cubre la pantalla completa (nunca se achica), para que el
    // fondo oscuro/blur tape el dashboard incluso con el teclado abierto. Adentro,
    // .modal-viewport es un contenedor invisible del tamaño del espacio REALMENTE
    // libre (viewport visual, que sí se reduce con el teclado) y desplazado con
    // top según offsetTop — así .modal-content se centra dentro de ese espacio
    // libre, nunca contra la pantalla completa (que incluiría la zona tapada
    // por el teclado). offsetTop compensa que el layout viewport de este
    // position:fixed no se mueve al abrir el teclado, aunque el viewport visual
    // sí se desplace hacia abajo (iOS/Chrome mobile).
    const viewportStyle = viewportHeight
        ? { height: `${viewportHeight}px`, top: `${viewportOffsetTop}px` }
        : undefined;

    const modalContent = (
        <div className={overlayClass} onClick={handleClose}>
            <div className="modal-viewport" style={viewportStyle}>
                <div
                    ref={contentRef}
                    className={contentClass}
                    onClick={e => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={title ? titleId : undefined}
                    tabIndex={-1}
                >
                    <div className="modal-header">
                        <div>
                            {title && <h3 id={titleId} className="modal-title">{title}</h3>}
                            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
                        </div>
                        {handleClose && (
                            <button className="modal-close" onClick={handleClose} aria-label="Cerrar">
                                <span className="material-symbols-outlined" aria-hidden="true">close</span>
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
        </div>
    );

    return createPortal(modalContent, document.getElementById('modal-root'));
};

export default Modal;
