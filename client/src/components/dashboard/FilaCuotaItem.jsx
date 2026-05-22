import React, { useState } from 'react';
import { formatCurrency } from '../../utils/format';

/**
 * Fila genérica de una compra/préstamo en cuotas con progreso visual y detalle expandible.
 * Usada por TarjetasCuotasCard (labelSaldado="Saldada") y PrestamosCard (labelSaldado="Saldado").
 */
const FilaCuotaItem = ({ grupo, labelSaldado = 'Saldada' }) => {
    const [expandida, setExpandida] = useState(false);
    const progreso   = grupo.cuotas > 0 ? (grupo.pagadas / grupo.cuotas) * 100 : 0;
    const finalizada = grupo.pendientes === 0;
    const hoyStr     = new Date().toISOString().split('T')[0];

    return (
        <div className={`cuotas-fila${finalizada ? ' cuotas-fila--finalizada' : ''}`}>
            <div
                className="cuotas-fila-header"
                onClick={() => setExpandida(v => !v)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setExpandida(v => !v)}
            >
                <div className="cuotas-fila-info">
                    <div className="cuotas-fila-top">
                        <span className="cuotas-descripcion">{grupo.descripcionBase}</span>
                        {finalizada ? (
                            <span className="cuotas-badge cuotas-badge--ok">
                                <span className="material-symbols-outlined">check_circle</span>
                                {labelSaldado}
                            </span>
                        ) : (
                            <span className="cuotas-badge cuotas-badge--pendiente">
                                {grupo.pendientes} restante{grupo.pendientes > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <span className="cuotas-categoria">{grupo.categoria}</span>
                    <div className="cuotas-barra-wrap">
                        <div className="cuotas-barra-track">
                            <div className="cuotas-barra-fill" style={{ width: `${progreso}%` }} />
                        </div>
                        <span className="cuotas-barra-label">{grupo.pagadas}/{grupo.cuotas} cuotas</span>
                    </div>
                </div>
                <div className="cuotas-fila-montos">
                    <span className="cuotas-monto-mensual">${formatCurrency(grupo.montoMensual)}/mes</span>
                    <span className="cuotas-monto-total">Total: ${formatCurrency(grupo.totalOriginal)}</span>
                    <span className={`cuotas-chevron${expandida ? ' cuotas-chevron--open' : ''}`}>
                        <span className="material-symbols-outlined">expand_more</span>
                    </span>
                </div>
            </div>

            {expandida && (
                <div className="cuotas-detalle">
                    {grupo.cuotasList.map((c) => {
                        const fechaStr = (c.fecha || '').split('T')[0];
                        const pagada   = fechaStr <= hoyStr;
                        const fecha    = new Date(`${fechaStr}T12:00:00`).toLocaleDateString('es-AR', {
                            month: 'short',
                            year:  'numeric',
                        });
                        return (
                            <div key={c.id} className={`cuotas-detalle-row${pagada ? ' cuotas-detalle-row--pagada' : ''}`}>
                                <span className="material-symbols-outlined cuotas-detalle-icon">
                                    {pagada ? 'check_circle' : 'radio_button_unchecked'}
                                </span>
                                <span className="cuotas-detalle-num">Cuota {c.numero_cuota}</span>
                                <span className="cuotas-detalle-fecha">{fecha}</span>
                                <span className="cuotas-detalle-monto">${formatCurrency(parseFloat(c.monto))}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default FilaCuotaItem;
