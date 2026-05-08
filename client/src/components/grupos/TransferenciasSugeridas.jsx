import React from 'react';

/**
 * Lista de transferencias mínimas calculadas para saldar todas las deudas del grupo.
 * Para cada transferencia que involucra al usuario actual, muestra el botón "Marcar como pagada".
 *
 * @param {Object} props
 * @param {Array<{de: string, para: string, monto: number}>} props.transferencias
 * @param {Array<{user_id: string, alias?: string}>} props.miembros - Lista completa de miembros activos
 * @param {string} props.userId - ID del usuario actual
 * @param {function} props.onLiquidar - Callback({deUserId, paraUserId, monto}) para pre-llenar el modal
 */
const TransferenciasSugeridas = ({ transferencias = [], miembros = [], userId, onLiquidar }) => {
    // Devuelve alias/nombre del miembro sin exponer IDs.
    const obtenerNombre = (userIdBuscado) => {
        const miembro = miembros.find((m) => m.user_id === userIdBuscado);
        return miembro?.alias?.trim() || miembro?.nombre?.trim() || 'Usuario sin nombre';
    };

    const formatearMonto = (valor) =>
        valor.toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    if (transferencias.length === 0) {
        return (
            <div className="transferencias-sugeridas__saldado">
                <span className="material-symbols-outlined transferencias-sugeridas__saldado-icon">
                    check_circle
                </span>
                <p>Todos están saldados.</p>
            </div>
        );
    }

    return (
        <div className="transferencias-sugeridas">
            {transferencias.map((tx, idx) => {
                // La transferencia involucra al usuario si es el que paga o el que recibe
                const involucraAlUsuario = tx.de === userId || tx.para === userId;

                return (
                    <div
                        key={idx}
                        className={`transferencias-sugeridas__item${involucraAlUsuario ? ' transferencias-sugeridas__item--destacado' : ''}`}
                    >
                        <div className="transferencias-sugeridas__texto">
                            <span className="transferencias-sugeridas__nombre">
                                {tx.de === userId ? 'Vos' : obtenerNombre(tx.de)}
                            </span>
                            <span className="transferencias-sugeridas__separador">le debe</span>
                            <span className="transferencias-sugeridas__monto">
                                ${formatearMonto(tx.monto)}
                            </span>
                            <span className="transferencias-sugeridas__separador">a</span>
                            <span className="transferencias-sugeridas__nombre">
                                {tx.para === userId ? 'vos' : obtenerNombre(tx.para)}
                            </span>
                        </div>

                        {/* Botón visible solo cuando el usuario actual está involucrado */}
                        {involucraAlUsuario && onLiquidar && (
                            <button
                                className="btn btn-primary transferencias-sugeridas__btn"
                                onClick={() =>
                                    onLiquidar({
                                        deUserId: tx.de,
                                        paraUserId: tx.para,
                                        monto: tx.monto,
                                    })
                                }
                            >
                                Marcar como pagada
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TransferenciasSugeridas;
