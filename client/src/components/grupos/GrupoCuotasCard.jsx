import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../utils/format';
import ConfirmModal from '../ConfirmModal';
import * as db from '../../lib/db';

/**
 * Fila de una compra grupal en cuotas con progreso visual y detalle expandible.
 * Muestra el monto por cuota total y cuánto le corresponde a cada participante.
 */
const FilaCuotaGrupal = ({ grupo, miembros, grupoId, userId, onAnuladoExito }) => {
    const navigate = useNavigate();
    const [expandida, setExpandida] = useState(false);
    const [modalAnular, setModalAnular] = useState(false);
    // Segunda confirmación cuando hay cuotas vencidas con historial
    const [modalForzar, setModalForzar] = useState(false);
    const [anulando, setAnulando] = useState(false);
    const progreso = grupo.cuotas > 0 ? (grupo.pagadas / grupo.cuotas) * 100 : 0;
    const finalizada = grupo.pendientes === 0;
    const hoyStr = new Date().toISOString().split('T')[0];
    const puedeAnular = grupo.pagadoPor === userId && !finalizada;
    const puedeEditar = grupo.pagadoPor === userId && !finalizada;

    // Resuelve el nombre de un miembro por user_id
    const nombreMiembro = (uid) => {
        const m = (miembros || []).find(m => m.user_id === uid);
        return m?.alias || m?.nombre || 'Miembro';
    };

    const handleAnular = async (force = false) => {
        try {
            setAnulando(true);
            await db.anularCuotasGrupales(grupo.id, grupoId, force);
            setModalAnular(false);
            setModalForzar(false);
            if (onAnuladoExito) onAnuladoExito();
        } catch (err) {
            if (err.tieneVencidas && !force) {
                // El backend avisó que hay cuotas vencidas — mostrar segunda confirmación
                setModalAnular(false);
                setModalForzar(true);
            } else {
                console.error('Error al anular cuotas grupales:', err);
            }
        } finally {
            setAnulando(false);
        }
    };

    return (
        <>
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
                                Saldada
                            </span>
                        ) : (
                            <span className="cuotas-badge cuotas-badge--pendiente">
                                {grupo.pendientes} restante{grupo.pendientes > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <span className="cuotas-categoria">
                        Pagó: {nombreMiembro(grupo.pagadoPor)}
                    </span>
                    <div className="cuotas-barra-wrap">
                        <div className="cuotas-barra-track">
                            <div className="cuotas-barra-fill" style={{ width: `${progreso}%` }} />
                        </div>
                        <span className="cuotas-barra-label">
                            {grupo.pagadas}/{grupo.cuotas} cuotas
                        </span>
                    </div>
                </div>
                <div className="cuotas-fila-montos">
                    <div className="cuotas-monto-bloque">
                        <span className="cuotas-monto-mensual">${formatCurrency(grupo.montoMensual)}/mes</span>
                        <span className="cuotas-monto-total">Total: ${formatCurrency(grupo.totalOriginal)}</span>
                    </div>
                    {(puedeEditar || puedeAnular) && (
                        <span className="cuotas-fila__acciones-sep" />
                    )}
                    {puedeEditar && (
                        <button
                            type="button"
                            className="btn btn-ghost cuotas-fila__btn-anular"
                            title="Editar compra"
                            onClick={(e) => { e.stopPropagation(); navigate(`/grupos/${grupoId}/gastos/${grupo.id}/editar`); }}
                        >
                            <span className="material-symbols-outlined">edit</span>
                        </button>
                    )}
                    {puedeAnular && (
                        <button
                            type="button"
                            className="btn btn-ghost cuotas-fila__btn-anular"
                            title="Anular todas las cuotas"
                            onClick={(e) => { e.stopPropagation(); setModalAnular(true); }}
                        >
                            <span className="material-symbols-outlined">block</span>
                        </button>
                    )}
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
                            <div
                                key={c.id}
                                className={`cuotas-detalle-row${pagada ? ' cuotas-detalle-row--pagada' : ''}`}
                            >
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

        {/* Confirmación inicial de anulación */}
        <ConfirmModal
            isOpen={modalAnular}
            onClose={() => setModalAnular(false)}
            onConfirm={() => handleAnular(false)}
            loading={anulando}
            title="Anular cuotas"
            message={`¿Anulás todas las cuotas de "${grupo.descripcionBase}"? Esta acción no se puede deshacer.`}
        />

        {/* Segunda confirmación: hay cuotas vencidas con historial */}
        <ConfirmModal
            isOpen={modalForzar}
            onClose={() => setModalForzar(false)}
            onConfirm={() => handleAnular(true)}
            loading={anulando}
            title="Anular cuotas con historial"
            message={`Esta compra ya tiene ${grupo.pagadas} cuota${grupo.pagadas > 1 ? 's' : ''} vencida${grupo.pagadas > 1 ? 's' : ''} registradas. ¿Confirmás la anulación de todas las cuotas restantes de "${grupo.descripcionBase}"?`}
        />
        </>
    );
};

/**
 * Card de seguimiento de compras grupales en cuotas con tarjeta de crédito.
 * Se usa dentro del tab Gastos de GrupoDetalle.
 *
 * @param {Object[]} grupos          - Array de grupos de cuotas (estructura de obtenerCuotasGrupal)
 * @param {Object[]} miembros        - Miembros del grupo para resolver nombres
 * @param {string}   grupoId         - ID del grupo (para el endpoint de anulación)
 * @param {string}   userId          - user_id del usuario autenticado
 * @param {Function} onAnuladoExito  - Callback para recargar datos tras anular
 */
const GrupoCuotasCard = ({ grupos, miembros, grupoId, userId, onAnuladoExito }) => {
    const [verSaldadas, setVerSaldadas] = useState(false);

    if (!grupos || grupos.length === 0) return null;

    const activas  = grupos.filter(g => g.pendientes > 0);
    const saldadas = grupos.filter(g => g.pendientes === 0);
    const visibles = verSaldadas ? grupos : activas;

    const totalPendienteMes = activas.reduce((s, g) => s + g.montoMensual, 0);

    return (
        <div className="glass-card cuotas-card">
            <div className="cuotas-card-header">
                <div className="cuotas-card-titulo-row">
                    <span className="material-symbols-outlined cuotas-card-icon">credit_card</span>
                    <h3 className="table-title">Tarjeta de Crédito — Cuotas</h3>
                    <span className="category-tag counter">
                        {activas.length} activa{activas.length !== 1 ? 's' : ''}
                    </span>
                </div>
                {activas.length > 0 && (
                    <div className="cuotas-card-resumen">
                        <span className="cuotas-resumen-label">Compromiso grupal este mes</span>
                        <span className="cuotas-resumen-monto">${formatCurrency(totalPendienteMes)}</span>
                    </div>
                )}
            </div>

            <div className="cuotas-lista">
                {visibles.length === 0 ? (
                    <p className="cuotas-empty-text">No hay compras activas.</p>
                ) : (
                    visibles.map(g => (
                        <FilaCuotaGrupal
                            key={g.id}
                            grupo={g}
                            miembros={miembros}
                            grupoId={grupoId}
                            userId={userId}
                            onAnuladoExito={onAnuladoExito}
                        />
                    ))
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
        </div>
    );
};

export default GrupoCuotasCard;
