import React from 'react';

/**
 * Tabla de saldos netos por miembro del grupo.
 * Indica si cada persona tiene saldo a favor (le deben), en contra (debe) o saldado.
 *
 * @param {Object} props
 * @param {Array<{user_id: string, saldo_neto: number}>} props.saldos
 * @param {Array<{user_id: string, nombre?: string, alias?: string}>} props.miembros
 * @param {string} props.userId - ID del usuario actual (para resaltar su fila)
 */
const SaldoTable = ({ saldos = [], miembros = [], userId }) => {
    // Formatea el monto como pesos argentinos
    const formatearMonto = (valor) =>
        Math.abs(valor).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const miembrosMap = new Map(miembros.map((m) => [m.user_id, m]));

    // Cruza el saldo con el miembro para obtener el nombre visible
    const obtenerNombre = (saldo) => {
        const miembro = miembrosMap.get(saldo.user_id);
        return miembro?.nombre?.trim() || miembro?.alias?.trim() || saldo.alias?.trim() || 'Usuario sin nombre';
    };

    // Determina la clase y el texto descriptivo según el signo del saldo y si es el usuario propio
    const obtenerEstado = (saldoNeto, esMiUsuario) => {
        if (saldoNeto > 0.01) {
            return {
                clase: 'saldo-table__estado--favor',
                texto: esMiUsuario ? 'Te deben' : 'Le deben',
            };
        }
        if (saldoNeto < -0.01) {
            return {
                clase: 'saldo-table__estado--deuda',
                texto: esMiUsuario ? 'Debés' : 'Debe',
            };
        }
        return { clase: 'saldo-table__estado--saldado', texto: 'Saldado' };
    };

    if (saldos.length === 0) {
        return (
            <p className="grupo-detalle__empty-msg">No hay saldos registrados todavía.</p>
        );
    }

    return (
        <div className="saldo-table">
            {saldos.map((saldo) => {
                const esMiUsuario = saldo.user_id === userId;
                const { clase, texto } = obtenerEstado(saldo.saldo_neto, esMiUsuario);
                const esNeutro = Math.abs(saldo.saldo_neto) <= 0.01;

                return (
                    <div
                        key={saldo.user_id}
                        className={`saldo-table__fila${esMiUsuario ? ' saldo-table__fila--yo' : ''}`}
                    >
                        {/* Avatar con inicial */}
                        <div className="saldo-table__avatar">
                            {obtenerNombre(saldo).charAt(0).toUpperCase()}
                        </div>

                        {/* Nombre del miembro */}
                        <div className="saldo-table__nombre">
                            {obtenerNombre(saldo)}
                            {esMiUsuario && (
                                <span className="saldo-table__yo-label">Vos</span>
                            )}
                        </div>

                        {/* Monto y estado */}
                        <div className={`saldo-table__monto ${clase}`}>
                            {esNeutro ? (
                                <span>{texto}</span>
                            ) : (
                                <>
                                    <span className="saldo-table__monto-texto">{texto}</span>
                                    <span className="saldo-table__monto-valor">
                                        ${formatearMonto(saldo.saldo_neto)}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default SaldoTable;
