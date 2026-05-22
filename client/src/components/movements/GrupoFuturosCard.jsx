import React from 'react';
import GlassCard from '../GlassCard';
import { formatCurrency } from '../../utils/format';

/**
 * Card de grupos de cuotas futuras (tarjeta de crédito o préstamos).
 * Unifica las secciones "Movimientos Futuros" y "Préstamos Futuros" de Movements.jsx.
 *
 * Props:
 *   grupos        — array de grupos con cuotasFuturas, descripcionBase, categoria, montoMensual
 *   cargando      — boolean
 *   icono         — nombre de material symbol (ej: 'schedule', 'handshake')
 *   titulo        — string (ej: 'Movimientos Futuros')
 *   subtitulo     — string
 *   labelContador — string singular (ej: 'compra', 'préstamo')
 *   thDescrip     — string encabezado de la columna descripción (ej: 'Compra', 'Préstamo')
 *   onEditar      — fn(grupo)
 *   onEliminar    — fn(grupo)
 */
const GrupoFuturosCard = ({
    grupos,
    cargando,
    icono,
    titulo,
    subtitulo,
    labelContador,
    thDescrip,
    onEditar,
    onEliminar,
}) => {
    return (
        <GlassCard className="futuros-card">
            <div className="futuros-header">
                <div className="futuros-titulo-row">
                    <span className="material-symbols-outlined futuros-icon">{icono}</span>
                    <h3 className="table-title">{titulo}</h3>
                    {!cargando && (
                        <span className="category-tag counter">
                            {grupos.length} {labelContador}{grupos.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <p className="futuros-subtitulo">{subtitulo}</p>
            </div>

            {cargando ? (
                <div className="empty-state" style={{ padding: '24px 0' }}>
                    <div className="loader mx-auto"></div>
                </div>
            ) : (
                <>
                    {/* Vista desktop */}
                    <div className="table-responsive movements-table-desktop">
                        <table className="movements-table">
                            <thead>
                                <tr>
                                    <th className="td-desc">{thDescrip}</th>
                                    <th>Categoría</th>
                                    <th className="text-center">Cuotas pendientes</th>
                                    <th className="td-amount">Monto/mes</th>
                                    <th className="td-amount">Total restante</th>
                                    <th className="td-actions">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grupos.map((grupo) => {
                                    const primerFecha   = new Date(`${grupo.cuotasFuturas[0].fecha.split('T')[0]}T12:00:00Z`);
                                    const ultimaFecha   = new Date(`${grupo.cuotasFuturas[grupo.cuotasFuturas.length - 1].fecha.split('T')[0]}T12:00:00Z`);
                                    const totalRestante = grupo.cuotasFuturas.reduce((s, c) => s + parseFloat(c.monto), 0);
                                    const fmtCorto = (d) => d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
                                    return (
                                        <tr key={grupo.id}>
                                            <td className="td-desc">
                                                <span style={{ fontWeight: 600 }}>{grupo.descripcionBase}</span>
                                                <span className="futuros-rango">
                                                    {fmtCorto(primerFecha)} {' → '} {fmtCorto(ultimaFecha)}
                                                </span>
                                            </td>
                                            <td><span className="category-tag-small">{grupo.categoria}</span></td>
                                            <td className="text-center">
                                                <span className="futuros-cuotas-badge">{grupo.cuotasFuturas.length}</span>
                                            </td>
                                            <td className="td-amount">-${formatCurrency(grupo.montoMensual)}</td>
                                            <td className="td-amount futuros-total">-${formatCurrency(totalRestante)}</td>
                                            <td className="td-actions">
                                                <div className="action-buttons-group">
                                                    <button type="button" onClick={() => onEditar(grupo)} className="action-btn edit" title="Editar">
                                                        <span className="material-symbols-outlined">edit</span>
                                                    </button>
                                                    <button type="button" onClick={() => onEliminar(grupo)} className="action-btn delete" title="Eliminar todas las cuotas">
                                                        <span className="material-symbols-outlined">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Vista mobile */}
                    <div className="movements-cards-mobile">
                        {grupos.map((grupo) => {
                            const primerFecha   = new Date(`${grupo.cuotasFuturas[0].fecha.split('T')[0]}T12:00:00Z`);
                            const ultimaFecha   = new Date(`${grupo.cuotasFuturas[grupo.cuotasFuturas.length - 1].fecha.split('T')[0]}T12:00:00Z`);
                            const totalRestante = grupo.cuotasFuturas.reduce((s, c) => s + parseFloat(c.monto), 0);
                            const fmtCorto = (d) => d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
                            return (
                                <div key={grupo.id} className="mov-card">
                                    <div className="mov-card-row">
                                        <span className="mov-card-desc">{grupo.descripcionBase}</span>
                                        <span className="mov-card-amount">-${formatCurrency(totalRestante)}</span>
                                    </div>
                                    <div className="mov-card-row mov-card-meta">
                                        <div className="mov-card-tags">
                                            <span className="category-tag-small">{grupo.categoria}</span>
                                            <span className="futuros-cuotas-badge">
                                                {grupo.cuotasFuturas.length} cuota{grupo.cuotasFuturas.length !== 1 ? 's' : ''}
                                            </span>
                                            <span className="method-tag-small">
                                                {fmtCorto(primerFecha)} {' → '} {fmtCorto(ultimaFecha)}
                                            </span>
                                        </div>
                                        <div className="mov-card-actions">
                                            <button type="button" onClick={() => onEditar(grupo)} className="action-btn edit" title="Editar">
                                                <span className="material-symbols-outlined">edit</span>
                                            </button>
                                            <button type="button" onClick={() => onEliminar(grupo)} className="action-btn delete" title="Eliminar">
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </GlassCard>
    );
};

export default GrupoFuturosCard;
