import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';
import CurrencyInput from '../../components/CurrencyInput';
import SaldoTable from '../../components/grupos/SaldoTable';
import TransferenciasSugeridas from '../../components/grupos/TransferenciasSugeridas';
import * as db from '../../lib/db';
import { calcularTransferencias } from '../../lib/grupos/saldos';

// Funciones puras de formato fuera del componente — no se recrean en cada render
const formatearMonto = (valor) =>
    Math.abs(valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatearFecha = (fecha) => {
    if (!fecha) return '–';
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
};

/**
 * Página/panel de saldos y liquidaciones de un grupo.
 * Muestra el saldo personal del usuario, la tabla de saldos de todos los miembros,
 * las transferencias mínimas sugeridas y el historial de liquidaciones registradas.
 *
 * @param {Object} props
 * @param {number|string} props.grupoId - ID del grupo
 * @param {Array<{user_id: string, alias?: string, estado: string}>} props.miembros - Miembros del grupo
 */
const GrupoSaldos = ({ grupoId, miembros = [] }) => {
    const { user } = useAuth();

    // ── Estado de datos ──
    const [saldos, setSaldos] = useState([]);
    const [liquidaciones, setLiquidaciones] = useState([]);
    const [transferencias, setTransferencias] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    // ── Estado del modal de liquidación ──
    const [modalLiquidacionAbierto, setModalLiquidacionAbierto] = useState(false);
    const [formLiq, setFormLiq] = useState({
        deUserId: '',
        paraUserId: '',
        monto: 0,
        fecha: new Date().toISOString().split('T')[0],
        nota: '',
    });
    const [errorForm, setErrorForm] = useState('');
    const [guardandoLiq, setGuardandoLiq] = useState(false);

    // ── Estado del modal de confirmación para anular ──
    const [confirmAnularId, setConfirmAnularId] = useState(null);
    const [anulando, setAnulando] = useState(false);

    const miembrosActivos = useMemo(
        () => miembros.filter((m) => m.estado === 'activo'),
        [miembros]
    );

    // Map para lookup O(1) de nombres de miembros
    const miembrosMap = useMemo(
        () => new Map(miembrosActivos.map((m) => [m.user_id, m])),
        [miembrosActivos]
    );

    // ── Carga de datos ──
    const cargarDatos = useCallback(async () => {
        if (!grupoId) return;
        try {
            setCargando(true);
            setError(null);

            const [saldosData, liquidacionesData] = await Promise.all([
                db.obtenerSaldosDelGrupo(grupoId),
                db.obtenerLiquidacionesDelGrupo(grupoId),
            ]);

            setSaldos(saldosData);
            setLiquidaciones(liquidacionesData);
            setTransferencias(calcularTransferencias(saldosData));
        } catch (err) {
            console.error('Error al cargar saldos:', err);
            setError('No se pudieron cargar los saldos. Intentá de nuevo.');
        } finally {
            setCargando(false);
        }
    }, [grupoId]);

    useEffect(() => {
        cargarDatos();
    }, [grupoId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Saldo del usuario actual ──
    const saldoNeto = useMemo(
        () => saldos.find((s) => s.user_id === user?.id)?.saldo_neto ?? 0,
        [saldos, user?.id]
    );

    const obtenerNombreMiembro = useCallback((userId) => {
        const miembro = miembrosMap.get(userId);
        return miembro?.nombre?.trim() || miembro?.alias?.trim() || 'Usuario sin nombre';
    }, [miembrosMap]);

    // ── Abrir modal pre-llenado (desde TransferenciasSugeridas) ──
    const abrirModalLiquidacion = ({ deUserId = '', paraUserId = '', monto = 0 } = {}) => {
        setFormLiq({
            deUserId,
            paraUserId,
            monto,
            fecha: new Date().toISOString().split('T')[0],
            nota: '',
        });
        setErrorForm('');
        setModalLiquidacionAbierto(true);
    };

    const cerrarModalLiquidacion = () => {
        if (guardandoLiq) return;
        setModalLiquidacionAbierto(false);
        setErrorForm('');
    };

    // ── Guardar liquidación ──
    const handleGuardarLiquidacion = async (e) => {
        e.preventDefault();
        setErrorForm('');

        // Validaciones client-side
        if (!formLiq.deUserId || !formLiq.paraUserId) {
            setErrorForm('Seleccioná quién paga y quién recibe.');
            return;
        }
        if (formLiq.deUserId === formLiq.paraUserId) {
            setErrorForm('El pagador y el receptor no pueden ser la misma persona.');
            return;
        }
        if (!formLiq.monto || Number(formLiq.monto) <= 0) {
            setErrorForm('El monto debe ser mayor a cero.');
            return;
        }
        if (!formLiq.fecha) {
            setErrorForm('La fecha es obligatoria.');
            return;
        }

        try {
            setGuardandoLiq(true);
            await db.registrarLiquidacion({
                grupoId,
                deUserId: formLiq.deUserId,
                paraUserId: formLiq.paraUserId,
                monto: Number(formLiq.monto),
                fecha: formLiq.fecha,
                nota: formLiq.nota,
            });
            setModalLiquidacionAbierto(false);
            // Recargamos saldos y liquidaciones para reflejar el cambio
            await cargarDatos();
        } catch (err) {
            console.error('Error al registrar liquidación:', err);
            setErrorForm(err.message || 'No se pudo registrar la liquidación.');
        } finally {
            setGuardandoLiq(false);
        }
    };

    // ── Anular liquidación ──
    const handleAnularLiquidacion = async () => {
        if (!confirmAnularId) return;
        try {
            setAnulando(true);
            await db.anularLiquidacion(confirmAnularId, grupoId);
            setConfirmAnularId(null);
            await cargarDatos();
        } catch (err) {
            console.error('Error al anular liquidación:', err);
            setError('No se pudo anular la liquidación. Intentá de nuevo.');
        } finally {
            setAnulando(false);
        }
    };

    // ── Estados de carga y error ──
    if (cargando) {
        return (
            <div className="grupo-saldos__loading">
                <div className="loading-spinner" />
                <p>Cargando saldos...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="grupos-page__error">
                <span className="material-symbols-outlined">error_outline</span>
                {error}
            </div>
        );
    }

    // ── Clase y texto del saldo propio ──
    const claseSaldoPropio =
        saldoNeto > 0.01
            ? 'grupo-saldos__saldo-propio--favor'
            : saldoNeto < -0.01
                ? 'grupo-saldos__saldo-propio--deuda'
                : 'grupo-saldos__saldo-propio--saldado';

    const textoSaldoPropio =
        saldoNeto > 0.01
            ? `Te deben $${formatearMonto(saldoNeto)}`
            : saldoNeto < -0.01
                ? `Debés $${formatearMonto(saldoNeto)}`
                : 'Estás saldado';

    return (
        <div className="grupo-saldos">
            {/* ── 1. Saldo personal destacado ── */}
            <div className={`glass-card grupo-saldos__saldo-propio ${claseSaldoPropio}`}>
                <span className="material-symbols-outlined grupo-saldos__saldo-propio-icono">
                    {saldoNeto > 0.01 ? 'trending_up' : saldoNeto < -0.01 ? 'trending_down' : 'check_circle'}
                </span>
                <div>
                    <p className="grupo-saldos__saldo-propio-label">Tu saldo en este grupo</p>
                    <p className="grupo-saldos__saldo-propio-valor">{textoSaldoPropio}</p>
                </div>
            </div>

            {/* ── 2. Tabla de saldos por miembro ── */}
            <div className="glass-card grupo-saldos__seccion">
                <h3 className="grupo-detalle__subtitulo">Saldos por miembro</h3>
                <SaldoTable saldos={saldos} miembros={miembrosActivos} userId={user?.id} />
            </div>

            {/* ── 3. Transferencias sugeridas ── */}
            <div className="glass-card grupo-saldos__seccion">
                <h3 className="grupo-detalle__subtitulo">Transferencias sugeridas</h3>
                <p className="grupo-saldos__seccion-desc">
                    La forma más eficiente de saldar todas las deudas del grupo.
                </p>
                <TransferenciasSugeridas
                    transferencias={transferencias}
                    miembros={miembrosActivos}
                    userId={user?.id}
                    onLiquidar={abrirModalLiquidacion}
                />
            </div>

            {/* ── 4. Liquidaciones registradas ── */}
            <div className="glass-card grupo-saldos__seccion">
                <div className="grupo-saldos__seccion-header">
                    <h3 className="grupo-detalle__subtitulo">Liquidaciones registradas</h3>
                    <button
                        className="btn btn-primary grupo-saldos__btn-registrar"
                        onClick={() => abrirModalLiquidacion()}
                    >
                        <span className="material-symbols-outlined">add</span>
                        Registrar liquidación
                    </button>
                </div>

                {liquidaciones.length === 0 ? (
                    <p className="grupo-detalle__empty-msg">
                        Ninguna liquidación registrada todavía.
                    </p>
                ) : (
                    <ul className="grupo-saldos__liq-lista">
                        {liquidaciones.map((liq) => (
                            <li key={liq.id} className="grupo-saldos__liq-item">
                                <div className="grupo-saldos__liq-info">
                                    <span className="grupo-saldos__liq-descripcion">
                                        <strong>{obtenerNombreMiembro(liq.de_user_id)}</strong>
                                        {' le pagó '}
                                        <strong>${formatearMonto(liq.monto)}</strong>
                                        {' a '}
                                        <strong>{obtenerNombreMiembro(liq.para_user_id)}</strong>
                                    </span>
                                    <span className="grupo-saldos__liq-fecha">
                                        {formatearFecha(liq.fecha)}
                                        {liq.nota && ` · ${liq.nota}`}
                                    </span>
                                </div>
                                <button
                                    className="btn btn-ghost grupo-saldos__btn-anular"
                                    onClick={() => setConfirmAnularId(liq.id)}
                                    title="Anular liquidación"
                                >
                                    <span className="material-symbols-outlined">undo</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* ── Modal: Registrar liquidación ── */}
            <Modal
                isOpen={modalLiquidacionAbierto}
                onClose={cerrarModalLiquidacion}
                title="Registrar liquidación"
                subtitle="Confirmá un pago realizado fuera de la app"
            >
                <form onSubmit={handleGuardarLiquidacion} className="grupo-saldos__form-liq">
                    {/* Mensaje de error del formulario */}
                    {errorForm && (
                        <div className="form-banner-error">
                            <span className="material-symbols-outlined">error_outline</span>
                            {errorForm}
                        </div>
                    )}

                    {/* Quién paga */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="liq-de">
                            Quién paga <span className="form-label--req">*</span>
                        </label>
                        <select
                            id="liq-de"
                            className="input"
                            value={formLiq.deUserId}
                            onChange={(e) =>
                                setFormLiq((prev) => ({ ...prev, deUserId: e.target.value }))
                            }
                            required
                        >
                            <option value="">Seleccioná quién paga</option>
                            {miembrosActivos.map((m) => (
                                <option key={m.user_id} value={m.user_id}>
                                    {m.alias?.trim() || m.nombre?.trim() || 'Usuario sin nombre'}
                                    {m.user_id === user?.id ? ' (vos)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Quién recibe */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="liq-para">
                            Quién recibe <span className="form-label--req">*</span>
                        </label>
                        <select
                            id="liq-para"
                            className="input"
                            value={formLiq.paraUserId}
                            onChange={(e) =>
                                setFormLiq((prev) => ({ ...prev, paraUserId: e.target.value }))
                            }
                            required
                        >
                            <option value="">Seleccioná quién recibe</option>
                            {/* Excluimos al pagador del listado de receptores */}
                            {miembrosActivos
                                .filter((m) => m.user_id !== formLiq.deUserId)
                                .map((m) => (
                                    <option key={m.user_id} value={m.user_id}>
                                        {m.alias?.trim() || m.nombre?.trim() || 'Usuario sin nombre'}
                                        {m.user_id === user?.id ? ' (vos)' : ''}
                                    </option>
                                ))}
                        </select>
                    </div>

                    {/* Monto */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="liq-monto">
                            Monto <span className="form-label--req">*</span>
                        </label>
                        <CurrencyInput
                            value={formLiq.monto}
                            onChange={(val) =>
                                setFormLiq((prev) => ({ ...prev, monto: val }))
                            }
                            placeholder="0,00"
                            required
                        />
                    </div>

                    {/* Fecha */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="liq-fecha">
                            Fecha <span className="form-label--req">*</span>
                        </label>
                        <input
                            id="liq-fecha"
                            type="date"
                            className="input"
                            value={formLiq.fecha}
                            onChange={(e) =>
                                setFormLiq((prev) => ({ ...prev, fecha: e.target.value }))
                            }
                            required
                        />
                    </div>

                    {/* Nota opcional */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="liq-nota">
                            Nota{' '}
                            <span className="form-label--opt">(opcional)</span>
                        </label>
                        <textarea
                            id="liq-nota"
                            className="input form-textarea"
                            value={formLiq.nota}
                            onChange={(e) =>
                                setFormLiq((prev) => ({ ...prev, nota: e.target.value }))
                            }
                            placeholder="Ej: te pasé por transferencia"
                            rows={2}
                        />
                    </div>

                    {/* Acciones */}
                    <div className="form-actions">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={cerrarModalLiquidacion}
                            disabled={guardandoLiq}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={guardandoLiq}
                        >
                            {guardandoLiq ? 'Guardando...' : 'Registrar'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ── Modal: Confirmar anulación ── */}
            <ConfirmModal
                isOpen={confirmAnularId !== null}
                onClose={() => setConfirmAnularId(null)}
                onConfirm={handleAnularLiquidacion}
                loading={anulando}
                title="Anular liquidación"
                message="¿Seguro que querés anular esta liquidación? Los saldos se actualizarán."
            />
        </div>
    );
};

export default GrupoSaldos;
