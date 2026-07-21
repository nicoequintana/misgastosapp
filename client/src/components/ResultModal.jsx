import React from 'react';
import Modal from './Modal';

// Configuración visual por tipo de resultado: ícono, color y texto del botón por defecto.
const CONFIG_TIPO = {
    success: { icono: 'check_circle', color: 'var(--success)', botonDefault: 'Continuar' },
    warning: { icono: 'warning', color: 'var(--warning)', botonDefault: 'Reintentar' },
    error:   { icono: 'cancel', color: 'var(--danger)', botonDefault: 'Ok' },
};

/**
 * Popup de resultado inmediato tras una acción (crear/editar/eliminar gasto, etc.):
 * ícono grande en círculo, título, y un único botón de cierre.
 * Convive con el sistema de notificaciones persistente (NotificacionesContext) — no lo reemplaza.
 *
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {'success'|'warning'|'error'} tipo
 * @param {string} titulo
 * @param {string} [mensaje] - Subtexto opcional debajo del título (ej. detalle de la acción).
 * @param {string} [textoBoton] - Si no se especifica, usa el default de cada tipo.
 * @param {boolean} [bare] - Si es true, renderiza solo el contenido (sin su propio <Modal>).
 *   Se usa cuando el resultado se muestra como una fase más adentro de un modal-wizard ya
 *   abierto (ej. GastoWizard/IngresoModal), para no anidar dos <Modal> (dos overlays/portals).
 */
const ResultModal = ({ isOpen, onClose, tipo = 'success', titulo, mensaje, textoBoton, bare = false }) => {
    const config = CONFIG_TIPO[tipo] || CONFIG_TIPO.success;

    if (bare && !isOpen) return null;

    const contenido = (
        <div className="result-modal">
            <span
                className="material-symbols-outlined result-modal__icono"
                style={{ color: config.color, borderColor: config.color }}
            >
                {config.icono}
            </span>
            <h3 className="result-modal__titulo">{titulo}</h3>
            {mensaje && <p className="result-modal__subtexto">{mensaje}</p>}
            <button
                type="button"
                className={`btn result-modal__boton result-modal__boton--${tipo}`}
                onClick={onClose}
            >
                {textoBoton || config.botonDefault}
            </button>
        </div>
    );

    if (bare) return contenido;

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            {contenido}
        </Modal>
    );
};

export default ResultModal;
