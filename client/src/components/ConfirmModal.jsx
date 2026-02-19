import React from 'react';
import Modal from './Modal';

/**
 * Componente de modal de confirmación para acciones destructivas.
 * @param {boolean} isOpen - Controla si el modal es visible.
 * @param {function} onClose - Función para cerrar el modal sin confirmar.
 * @param {function} onConfirm - Función para ejecutar la acción confirmada (ej: eliminar).
 * @param {string} title - Título del modal.
 * @param {string} message - Mensaje descriptivo de la acción a confirmar.
 */
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="modal-body-centered">
                <p className="modal-message">{message}</p>
                <div className="modal-actions">
                    <button onClick={onClose} className="btn btn-secondary">
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="btn btn-danger-gradient"
                    >
                        Eliminar
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ConfirmModal;
