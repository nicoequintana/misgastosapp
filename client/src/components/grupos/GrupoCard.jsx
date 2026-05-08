import React from 'react';

/**
 * Card glassmorphism para mostrar un grupo de gastos compartidos en la lista.
 * Muestra nombre, descripción, moneda, estado y el saldo neto del usuario actual.
 *
 * @param {Object} props
 * @param {Object} props.grupo - Datos del grupo: { id, nombre, descripcion, moneda, archivado, fecha_creacion }
 * @param {number|null} props.saldoNeto - Saldo neto del usuario en este grupo (positivo=a favor, negativo=debe)
 * @param {number|null} props.cantidadMiembros - Cantidad de miembros activos (opcional)
 * @param {Function} props.onClick - Callback al hacer click en la card: onClick(grupoId)
 */
const GrupoCard = ({ grupo, saldoNeto, cantidadMiembros, onClick }) => {
    // Determina el estado del saldo para mostrar el indicador correcto
    const renderSaldo = () => {
        if (saldoNeto == null) return null;

        if (saldoNeto > 0) {
            return (
                <span className="grupo-card__saldo grupo-card__saldo--favor">
                    Te deben ${saldoNeto.toFixed(2)}
                </span>
            );
        }

        if (saldoNeto < 0) {
            return (
                <span className="grupo-card__saldo grupo-card__saldo--deuda">
                    Debés ${Math.abs(saldoNeto).toFixed(2)}
                </span>
            );
        }

        return (
            <span className="grupo-card__saldo grupo-card__saldo--saldado">
                Saldado
            </span>
        );
    };

    return (
        <div
            className={`glass-card grupo-card ${grupo.archivado ? 'grupo-card--archivado' : ''}`}
            onClick={() => onClick && onClick(grupo.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick && onClick(grupo.id)}
            aria-label={`Grupo ${grupo.nombre}`}
        >
            {/* Encabezado: nombre + estado */}
            <div className="grupo-card__header">
                <h3 className="grupo-card__nombre">{grupo.nombre}</h3>
                {grupo.archivado && (
                    <span className="grupo-card__badge grupo-card__badge--archivado">Archivado</span>
                )}
            </div>

            {/* Descripción opcional */}
            {grupo.descripcion && (
                <p className="grupo-card__descripcion">{grupo.descripcion}</p>
            )}

            {/* Metadatos: moneda y miembros */}
            <div className="grupo-card__meta">
                <span className="grupo-card__moneda">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle' }}>
                        payments
                    </span>{' '}
                    {grupo.moneda || 'ARS'}
                </span>
                {cantidadMiembros != null && (
                    <span className="grupo-card__miembros">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle' }}>
                            group
                        </span>{' '}
                        {cantidadMiembros} {cantidadMiembros === 1 ? 'miembro' : 'miembros'}
                    </span>
                )}
            </div>

            {/* Saldo neto */}
            <div className="grupo-card__footer">
                {renderSaldo()}
                <span className="material-symbols-outlined grupo-card__chevron">chevron_right</span>
            </div>
        </div>
    );
};

export default GrupoCard;
