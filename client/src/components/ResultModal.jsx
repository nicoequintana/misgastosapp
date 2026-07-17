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
 * ícono grande en círculo, título, subtítulo opcional, y un único botón de cierre.
 * Convive con el sistema de notificaciones persistente (NotificacionesContext) — no lo reemplaza.
 *
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {'success'|'warning'|'error'} tipo
 * @param {string} titulo
 * @param {string} [subtitulo]
 * @param {string} [textoBoton] - Si no se especifica, usa el default de cada tipo.
 */
const ResultModal = ({ isOpen, onClose, tipo = 'success', titulo, subtitulo, textoBoton }) => {
    const config = CONFIG_TIPO[tipo] || CONFIG_TIPO.success;

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="result-modal">
                <span
                    className="material-symbols-outlined result-modal__icono"
                    style={{ color: config.color, borderColor: config.color }}
                >
                    {config.icono}
                </span>
                <h3 className="result-modal__titulo">{titulo}</h3>
                {subtitulo && <p className="result-modal__subtitulo">{subtitulo}</p>}
                <button
                    type="button"
                    className={`btn result-modal__boton result-modal__boton--${tipo}`}
                    onClick={onClose}
                >
                    {textoBoton || config.botonDefault}
                </button>
            </div>
        </Modal>
    );
};

export default ResultModal;
