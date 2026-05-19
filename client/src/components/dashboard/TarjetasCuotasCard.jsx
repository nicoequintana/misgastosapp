import React, { useState } from 'react';
import GlassCard from '../GlassCard';
import { formatCurrency } from '../../utils/format';

/**
 * Fila de una compra en cuotas con progreso visual y detalle expandible.
 */
const FilaCuota = ({ grupo }) => {
    const [expandida, setExpandida] = useState(false);
    const progreso = grupo.cuotas > 0 ? (grupo.pagadas / grupo.cuotas) * 100 : 0;
    const finalizada = grupo.pendientes === 0;

    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];

    return (
        <div className={`cuotas-fila${finalizada ? ' cuotas-fila--finalizada' : ''}`}>
            <div className="cuotas-fila-header" onClick={() => setExpandida(v => !v)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setExpandida(v => !v)}>
                <div className="cuotas-fila-info">
                    <div className="cuotas-fila-top">
                        <span className="cuotas-descripcion">{grupo.descripcionBase}</span>
                        {finalizada && (
                            <span className="cuotas-badge cuotas-badge--ok">
                                <span className="material-symbols-outlined">check_circle</span>
                                Saldada
                            </span>
                        )}
                        {!finalizada && (
                            <span className="cuotas-badge cuotas-badge--pendiente">
                                {grupo.pendientes} restante{grupo.pendientes > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <span className="cuotas-categoria">{grupo.categoria}</span>
                    <div className="cuotas-barra-wrap">
                        <div className="cuotas-barra-track">
                            <div
                                className="cuotas-barra-fill"
                                style={{ width: `${progreso}%` }}
                            />
                        </div>
                        <span className="cuotas-barra-label">
                            {grupo.pagadas}/{grupo.cuotas} cuotas
                        </span>
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
                        const pagada = fechaStr <= hoyStr;
                        const fecha = new Date(`${fechaStr}T12:00:00`).toLocaleDateString('es-AR', {
                            month: 'short',
                            year: 'numeric',
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

/**
 * Card unificada de tarjeta de crédito.
 * Bloque superior: cuotas del mes en curso.
 * Bloque inferior: cuotas que impactan el mes siguiente.
 */
const TarjetasCuotasCard = ({ grupos, gastosFuturos }) => {
    const [verSaldadas, setVerSaldadas] = useState(false);

    const activas  = grupos.filter(g => g.pendientes > 0);
    const saldadas = grupos.filter(g => g.pendientes === 0);
    const visibles = verSaldadas ? grupos : activas;

    // Solo suma cuotas cuya fecha cae en el mes en curso
    const totalPendienteMes = activas.reduce((s, g) => s + (g.montoMesCorriente ?? 0), 0);

    // Mes siguiente para el label del bloque futuro
    const hoy = new Date();
    const anioSig = hoy.getMonth() === 11 ? hoy.getFullYear() + 1 : hoy.getFullYear();
    const mesSig  = hoy.getMonth() === 11 ? 1 : hoy.getMonth() + 2;
    const nombreMesSig = new Date(anioSig, mesSig - 1, 1).toLocaleDateString('es-AR', {
        month: 'long',
        year: 'numeric',
    });

    const gruposFuturos     = (gastosFuturos ?? []).filter(g => g.montoMesSiguiente > 0);
    const totalMesSiguiente = gruposFuturos.reduce((s, g) => s + g.montoMesSiguiente, 0);

    return (
        <GlassCard className="cuotas-card">

            {/* ── Bloque: mes en curso ── */}
            <div className="cuotas-card-header">
                <div className="cuotas-card-titulo-row">
                    <span className="material-symbols-outlined cuotas-card-icon">credit_card</span>
                    <h3 className="table-title">Tarjeta de Crédito — Cuotas</h3>
                    <span className="category-tag counter">{activas.length} activa{activas.length !== 1 ? 's' : ''}</span>
                </div>
                {activas.length > 0 && (
                    <div className="cuotas-card-resumen">
                        <span className="cuotas-resumen-label">Compromiso este mes</span>
                        <span className="cuotas-resumen-monto">${formatCurrency(totalPendienteMes)}</span>
                    </div>
                )}
            </div>

            {grupos.length === 0 ? (
                <div className="dashboard-table-empty">
                    <span className="material-symbols-outlined dashboard-table-empty-icon">credit_card_off</span>
                    <p>Sin compras en cuotas registradas</p>
                </div>
            ) : (
                <>
                    <div className="cuotas-lista">
                        {visibles.length === 0 ? (
                            <p className="cuotas-empty-text">No hay compras activas.</p>
                        ) : (
                            visibles.map(g => <FilaCuota key={g.id} grupo={g} />)
                        )}
                    </div>
                    {saldadas.length > 0 && (
                        <button
                            type="button"
                            className="cuotas-toggle-saldadas"
                            onClick={() => setVerSaldadas(v => !v)}
                        >
                            <span className="material-symbols-outlined">
                                {verSaldadas ? 'visibility_off' : 'visibility'}
                            </span>
                            {verSaldadas
                                ? 'Ocultar saldadas'
                                : `Ver ${saldadas.length} saldada${saldadas.length > 1 ? 's' : ''}`}
                        </button>
                    )}
                </>
            )}

            {/* ── Separador ── */}
            <div className="cuotas-seccion-divider" />

            {/* ── Bloque: mes siguiente ── */}
            <div className="cuotas-card-header cuotas-card-header--futuro">
                <div className="cuotas-card-titulo-row">
                    <span className="material-symbols-outlined cuotas-card-icon cuotas-card-icon--futuro">event_upcoming</span>
                    <h3 className="table-title">Gastos Futuros — Tarjeta</h3>
                </div>
                {gruposFuturos.length > 0 && (
                    <div className="cuotas-card-resumen cuotas-card-resumen--futuro">
                        <span className="cuotas-resumen-label">{nombreMesSig}</span>
                        <span className="cuotas-resumen-monto cuotas-resumen-monto--futuro">
                            ${formatCurrency(totalMesSiguiente)}
                        </span>
                    </div>
                )}
            </div>

            {gruposFuturos.length === 0 ? (
                <div className="dashboard-table-empty">
                    <span className="material-symbols-outlined dashboard-table-empty-icon">event_available</span>
                    <p>Sin cuotas programadas para {nombreMesSig}</p>
                </div>
            ) : (
                <div className="cuotas-lista">
                    {gruposFuturos.map(g => (
                        <div key={g.id} className="cuotas-fila">
                            <div className="cuotas-fila-header cuotas-fila-header--static">
                                <div className="cuotas-fila-info">
                                    <span className="cuotas-descripcion">{g.descripcionBase}</span>
                                    <span className="cuotas-categoria">{g.categoria}</span>
                                </div>
                                <div className="cuotas-fila-montos">
                                    <span className="cuotas-monto-mensual cuotas-monto-mensual--futuro">
                                        ${formatCurrency(g.montoMesSiguiente)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

        </GlassCard>
    );
};

export default TarjetasCuotasCard;
