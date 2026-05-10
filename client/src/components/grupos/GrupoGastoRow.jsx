import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmModal from '../ConfirmModal';
import Modal from '../Modal';
import * as db from '../../lib/db';

/**
 * Fila que representa un gasto dentro de un grupo de gastos compartidos.
 * - Todos los miembros pueden ver el detalle (participantes y montos).
 * - Solo el creador puede editar.
 * - El creador o un admin pueden anular.
 *
 * @param {Object}   props
 * @param {Object}   props.gasto       - { id, descripcion, monto, pagado_por, fecha, estado, creado_por }
 * @param {Array}    props.miembros    - Lista de miembros del grupo para resolver nombres
 * @param {string}   props.userId      - user_id del usuario autenticado
 * @param {Function} props.onAnular    - Callback que recibe el gastoId al confirmar la anulación
 * @param {string}   props.grupoId     - ID del grupo (para construir la ruta de edición)
 */
const GrupoGastoRow = ({ gasto, miembros = [], userId, onAnular, grupoId }) => {
    const navigate = useNavigate();
    const [modalAnularAbierto, setModalAnularAbierto] = useState(false);
    const [anulando, setAnulando] = useState(false);

    // Estado del modal de detalle
    const [modalDetalleAbierto, setModalDetalleAbierto] = useState(false);
    const [detalle, setDetalle] = useState(null);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);
    const [errorDetalle, setErrorDetalle] = useState(null);

    const resolverNombre = (userId) => {
        const miembro = miembros.find((m) => m.user_id === userId);
        return miembro?.alias?.trim() || miembro?.nombre?.trim() || 'Usuario sin nombre';
    };

    const formatearMonto = (monto) =>
        `$ ${Number(monto).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;

    const formatearFecha = (fecha) => {
        if (!fecha) return '–';
        const [año, mes, dia] = fecha.split('-');
        return new Date(Date.UTC(año, mes - 1, dia)).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        });
    };

    const puedeEditar = gasto.estado === 'activo' && gasto.pagado_por === userId;
    const puedeAnular = gasto.estado === 'activo' && gasto.pagado_por === userId;
    const anulado = gasto.estado === 'anulado';

    const handleConfirmarAnulacion = async () => {
        try {
            setAnulando(true);
            await onAnular(gasto.id);
        } finally {
            setAnulando(false);
            setModalAnularAbierto(false);
        }
    };

    const handleAbrirDetalle = async () => {
        setModalDetalleAbierto(true);
        if (detalle) return; // Ya cargado anteriormente
        try {
            setCargandoDetalle(true);
            setErrorDetalle(null);
            const data = await db.obtenerGastoConParticipantes(gasto.id);
            setDetalle(data);
        } catch (err) {
            console.error('Error al cargar detalle del gasto:', err);
            setErrorDetalle('No se pudo cargar el detalle del gasto.');
        } finally {
            setCargandoDetalle(false);
        }
    };

    return (
        <>
            <div className={`grupo-gasto-row ${anulado ? 'grupo-gasto-row--anulado' : ''}`}>
                {/* Columna principal: descripción + pagador */}
                <div className="grupo-gasto-row__main">
                    <span className="grupo-gasto-row__descripcion">{gasto.descripcion}</span>
                    <span className="grupo-gasto-row__pagador">
                        Pagó {resolverNombre(gasto.pagado_por)}
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

                {/* Botones: detalle siempre visible, editar/anular según permisos */}
                <div className="grupo-gasto-row__acciones">
                    <button
                        className="btn btn-ghost grupo-gasto-row__btn-accion"
                        onClick={handleAbrirDetalle}
                        title="Ver detalle"
                    >
                        <span className="material-symbols-outlined">info</span>
                    </button>
                    {puedeEditar && (
                        <button
                            className="btn btn-ghost grupo-gasto-row__btn-accion"
                            onClick={() => navigate(`/grupos/${grupoId}/gastos/${gasto.id}/editar`)}
                            title="Editar gasto"
                        >
                            <span className="material-symbols-outlined">edit</span>
                        </button>
                    )}
                    {puedeAnular && (
                        <button
                            className="btn btn-ghost grupo-gasto-row__btn-accion grupo-gasto-row__btn-anular"
                            onClick={() => setModalAnularAbierto(true)}
                            title="Anular gasto"
                        >
                            <span className="material-symbols-outlined">block</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Modal de detalle del gasto */}
            <Modal
                isOpen={modalDetalleAbierto}
                onClose={() => setModalDetalleAbierto(false)}
                title={gasto.descripcion}
                subtitle={`${formatearMonto(gasto.monto)} · Pagó ${resolverNombre(gasto.pagado_por)}`}
            >
                <div className="grupo-gasto-detalle">
                    {cargandoDetalle && (
                        <div className="grupo-gasto-detalle__loading">
                            <div className="loading-spinner" />
                            <p>Cargando detalle...</p>
                        </div>
                    )}

                    {errorDetalle && (
                        <div className="form-banner-error">
                            <span className="material-symbols-outlined">error_outline</span>
                            {errorDetalle}
                        </div>
                    )}

                    {detalle && !cargandoDetalle && (
                        <>
                            {detalle.nota && (
                                <p className="grupo-gasto-detalle__nota">
                                    <span className="material-symbols-outlined">note</span>
                                    {detalle.nota}
                                </p>
                            )}

                            <h4 className="grupo-gasto-detalle__titulo-seccion">División del gasto</h4>

                            {detalle.participantes.length === 0 ? (
                                <p className="grupo-detalle__empty-msg">Sin participantes registrados.</p>
                            ) : (
                                <ul className="grupo-gasto-detalle__participantes">
                                    {detalle.participantes.map((p) => (
                                        <li key={p.id} className="grupo-gasto-detalle__participante">
                                            <div className="grupo-gasto-detalle__participante-avatar">
                                                {resolverNombre(p.user_id).charAt(0).toUpperCase()}
                                            </div>
                                            <span className="grupo-gasto-detalle__participante-nombre">
                                                {resolverNombre(p.user_id)}
                                                {p.user_id === userId && (
                                                    <span className="saldo-table__yo-label">Vos</span>
                                                )}
                                            </span>
                                            <span className="grupo-gasto-detalle__participante-monto">
                                                {formatearMonto(p.monto_asignado)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>
            </Modal>

            {/* Modal de confirmación de anulación */}
            <ConfirmModal
                isOpen={modalAnularAbierto}
                onClose={() => setModalAnularAbierto(false)}
                onConfirm={handleConfirmarAnulacion}
                loading={anulando}
                title="Anular gasto"
                message={`¿Anulás el gasto "${gasto.descripcion}" de ${formatearMonto(gasto.monto)}? Esta acción no se puede deshacer.`}
            />
        </>
    );
};

export default GrupoGastoRow;
