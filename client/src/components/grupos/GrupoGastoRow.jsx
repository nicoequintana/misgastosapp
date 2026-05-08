import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmModal from '../ConfirmModal';

/**
 * Fila que representa un gasto dentro de un grupo de gastos compartidos.
 * Muestra descripción, monto, pagador, fecha y estado.
 * El botón "Anular" solo es visible para el creador del gasto o un admin del grupo,
 * y solo cuando el gasto está activo.
 *
 * @param {Object}   props
 * @param {Object}   props.gasto       - Datos del gasto: { id, descripcion, monto, pagado_por, fecha, estado, creado_por }
 * @param {Array}    props.miembros    - Lista de miembros del grupo para resolver alias del pagador
 * @param {string}   props.userId      - user_id del usuario autenticado actualmente
 * @param {boolean}  props.esAdmin     - true si el usuario actual es admin del grupo
 * @param {Function} props.onAnular    - Callback que recibe el gastoId al confirmar la anulación
 * @param {string}   props.grupoId     - ID del grupo (para construir la ruta de edición)
 */
const GrupoGastoRow = ({ gasto, miembros = [], userId, esAdmin = false, onAnular, grupoId }) => {
    const navigate = useNavigate();
    const [modalAbierto, setModalAbierto] = useState(false);
    const [anulando, setAnulando] = useState(false);

    // Determina el nombre visible del pagador sin mostrar IDs.
    const resolverAliasPagador = (pagadoPor) => {
        const miembro = miembros.find((m) => m.user_id === pagadoPor);
        if (miembro?.alias) return miembro.alias;
        if (miembro?.nombre) return miembro.nombre;
        return 'Usuario sin nombre';
        };

    // Formatea el monto con estilo argentino (ej: $ 1.234,56)
    const formatearMonto = (monto) =>
        `$ ${Number(monto).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;

    // Formatea la fecha en formato legible (ej: 07 de mayo de 2026)
    const formatearFecha = (fecha) => {
        if (!fecha) return '–';
        // La fecha viene como DATE ('YYYY-MM-DD'): parseamos en UTC para evitar desfase de zona horaria
        const [año, mes, dia] = fecha.split('-');
        return new Date(Date.UTC(año, mes - 1, dia)).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        });
    };

    // Puede editar/anular si: gasto activo Y (es el creador O es admin del grupo)
    const puedeOperar =
        gasto.estado === 'activo' &&
        (gasto.creado_por === userId || esAdmin);

    // Confirma y ejecuta la anulación
    const handleConfirmarAnulacion = async () => {
        try {
            setAnulando(true);
            await onAnular(gasto.id);
        } finally {
            setAnulando(false);
            setModalAbierto(false);
        }
    };

    const anulado = gasto.estado === 'anulado';

    return (
        <>
            <div className={`grupo-gasto-row ${anulado ? 'grupo-gasto-row--anulado' : ''}`}>
                {/* Columna principal: descripción + pagador */}
                <div className="grupo-gasto-row__main">
                    <span className="grupo-gasto-row__descripcion">{gasto.descripcion}</span>
                    <span className="grupo-gasto-row__pagador">
                        Pagó {resolverAliasPagador(gasto.pagado_por)}
                    </span>
                </div>

                {/* Columna secundaria: monto + fecha + estado */}
                <div className="grupo-gasto-row__meta">
                    <span className={`grupo-gasto-row__monto ${anulado ? 'grupo-gasto-row__monto--anulado' : ''}`}>
                        {formatearMonto(gasto.monto)}
                    </span>
                    <span className="grupo-gasto-row__fecha">{formatearFecha(gasto.fecha)}</span>
                    {anulado && (
                        <span className="grupo-gasto-row__badge-anulado">Anulado</span>
                    )}
                </div>

                {/* Botones de acción: solo visibles si el usuario tiene permiso */}
                {puedeOperar && (
                    <div className="grupo-gasto-row__acciones">
                        <button
                            className="btn btn-ghost grupo-gasto-row__btn-accion"
                            onClick={() => navigate(`/grupos/${grupoId}/gastos/${gasto.id}/editar`)}
                            title="Editar gasto"
                        >
                            <span className="material-symbols-outlined">edit</span>
                        </button>
                        <button
                            className="btn btn-ghost grupo-gasto-row__btn-accion grupo-gasto-row__btn-anular"
                            onClick={() => setModalAbierto(true)}
                            title="Anular gasto"
                        >
                            <span className="material-symbols-outlined">block</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Modal de confirmación de anulación */}
            <ConfirmModal
                isOpen={modalAbierto}
                onClose={() => setModalAbierto(false)}
                onConfirm={handleConfirmarAnulacion}
                loading={anulando}
                title="Anular gasto"
                message={`¿Anulás el gasto "${gasto.descripcion}" de ${formatearMonto(gasto.monto)}? Esta acción no se puede deshacer.`}
            />
        </>
    );
};

export default GrupoGastoRow;
