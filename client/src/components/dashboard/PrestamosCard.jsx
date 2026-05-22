import React, { useState } from 'react';
import GlassCard from '../GlassCard';
import FilaCuotaItem from './FilaCuotaItem';
import { formatCurrency, calcularMesSiguiente } from '../../utils/format';

/**
 * Card de préstamos en cuotas.
 * Bloque superior: cuotas del mes en curso.
 * Bloque inferior: cuotas que impactan el mes siguiente.
 */
const PrestamosCard = ({ grupos, gastosFuturos }) => {
    const [verSaldados, setVerSaldados] = useState(false);

    const activos  = grupos.filter(g => g.pendientes > 0);
    const saldados = grupos.filter(g => g.pendientes === 0);
    const visibles = verSaldados ? grupos : activos;

    const totalPendienteMes = activos.reduce((s, g) => s + (g.montoMesCorriente ?? 0), 0);

    const { nombre: nombreMesSig } = calcularMesSiguiente();
    const gruposFuturos     = (gastosFuturos ?? []).filter(g => g.montoMesSiguiente > 0);
    const totalMesSiguiente = gruposFuturos.reduce((s, g) => s + g.montoMesSiguiente, 0);

    return (
        <GlassCard className="cuotas-card">

            {/* ── Bloque: mes en curso ── */}
            <div className="cuotas-card-header">
                <div className="cuotas-card-titulo-row">
                    <span className="material-symbols-outlined cuotas-card-icon">handshake</span>
                    <h3 className="table-title">Préstamos — Cuotas</h3>
                    <span className="category-tag counter">{activos.length} activo{activos.length !== 1 ? 's' : ''}</span>
                </div>
                {activos.length > 0 && (
                    <div className="cuotas-card-resumen">
                        <span className="cuotas-resumen-label">Compromiso este mes</span>
                        <span className="cuotas-resumen-monto">${formatCurrency(totalPendienteMes)}</span>
                    </div>
                )}
            </div>

            {grupos.length === 0 ? (
                <div className="dashboard-table-empty">
                    <span className="material-symbols-outlined dashboard-table-empty-icon">money_off</span>
                    <p>Sin préstamos en cuotas registrados</p>
                </div>
            ) : (
                <>
                    <div className="cuotas-lista">
                        {visibles.length === 0 ? (
                            <p className="cuotas-empty-text">No hay préstamos activos.</p>
                        ) : (
                            visibles.map(g => <FilaCuotaItem key={g.id} grupo={g} labelSaldado="Saldado" />)
                        )}
                    </div>
                    {saldados.length > 0 && (
                        <button
                            type="button"
                            className="cuotas-toggle-saldadas"
                            onClick={() => setVerSaldados(v => !v)}
                        >
                            <span className="material-symbols-outlined">
                                {verSaldados ? 'visibility_off' : 'visibility'}
                            </span>
                            {verSaldados
                                ? 'Ocultar saldados'
                                : `Ver ${saldados.length} saldado${saldados.length > 1 ? 's' : ''}`}
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
                    <h3 className="table-title">Gastos Futuros — Préstamos</h3>
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
                    <p>Sin cuotas de préstamos programadas para {nombreMesSig}</p>
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

export default PrestamosCard;
