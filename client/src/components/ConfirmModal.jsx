import React from 'react';
import Modal from './Modal';

/**
 * Componente de modal de confirmación para acciones destructivas.
 * @param {boolean} isOpen - Controla si el modal es visible.
 * @param {function} onClose - Función para cerrar el modal sin confirmar.
 * @param {function} onConfirm - Función para ejecutar la acción confirmada (ej: eliminar).
 * @param {string} title - Título del modal.
 * @param {string} message - Mensaje descriptivo de la acción a confirmar.
 * @param {string} [error] - Si la confirmación falló, mensaje de error a mostrar
 *   dentro del modal (que permanece abierto) en vez de perderse en otra parte
 *   de la pantalla.
 */
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, error, loading = false }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} disableClose={loading} title={title}>
            <div className="modal-body-centered">
                <p className="modal-message">{message}</p>
                {error && <p className="form-error" role="alert">{error}</p>}
                <div className="modal-actions">
                    <button onClick={onClose} disabled={loading} className="btn btn-secondary">
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="btn btn-danger-gradient"
                    >
                        {loading ? 'Eliminando...' : 'Eliminar'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ConfirmModal;
