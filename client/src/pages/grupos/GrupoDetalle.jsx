import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import GrupoTabs from '../../components/grupos/GrupoTabs';
import MiembroChip from '../../components/grupos/MiembroChip';
import GrupoGastoRow from '../../components/grupos/GrupoGastoRow';
import GrupoCuotasCard from '../../components/grupos/GrupoCuotasCard';
import GrupoSaldos from './GrupoSaldos';
import InvitarMiembroModal from '../../components/grupos/InvitarMiembroModal';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import * as db from '../../lib/db';
import { formatDate } from '../../utils/format';

// Definición de los tabs disponibles en el detalle del grupo
const TABS = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'gastos', label: 'Gastos' },
    { id: 'miembros', label: 'Miembros' },
    { id: 'saldos', label: 'Saldos' },
];

const TABS_VALIDOS = TABS.map((t) => t.id);

/**
 * Página de detalle de un grupo de gastos compartidos.
 * Carga los datos del grupo y sus miembros, y muestra tabs para navegar entre
 * Resumen / Gastos / Miembros / Saldos.
 *
 * @param {Object} props
 * @param {string} [props.defaultTab='resumen'] - Tab inicial (para deep-links por ruta)
 */
const GrupoDetalle = ({ defaultTab = 'resumen' }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    // Determina el tab inicial: prioridad → location.state.tab → defaultTab → 'resumen'
    const tabInicial = (() => {
        const estadoTab = location.state?.tab;
        if (estadoTab && TABS_VALIDOS.includes(estadoTab)) return estadoTab;
        if (TABS_VALIDOS.includes(defaultTab)) return defaultTab;
        return 'resumen';
    })();

    // Estado del grupo y miembros
    const [grupo, setGrupo] = useState(null);
    const [miembros, setMiembros] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [tabActivo, setTabActivo] = useState(tabInicial);

    // Estado del tab Gastos
    const [gastos, setGastos] = useState([]);
    const [cargandoGastos, setCargandoGastos] = useState(false);
    const [cuotasGrupo, setCuotasGrupo] = useState([]);

    // Estado del modal de invitación
    const [mostrarInvitar, setMostrarInvitar] = useState(false);

    // Estado de invitaciones pendientes (tab Miembros)
    const [invitacionesPendientes, setInvitacionesPendientes] = useState([]);
    const [cargandoInvitaciones, setCargandoInvitaciones] = useState(false);

    // Estado para eliminar grupo
    const [mostrarEliminar, setMostrarEliminar] = useState(false);
    const [eliminandoGrupo, setEliminandoGrupo] = useState(false);
    const [errorEliminar, setErrorEliminar] = useState(null);

    // Estado para anular gasto grupal
    const [gastoAAnular, setGastoAAnular] = useState(null);
    const [anulandoGasto, setAnulandoGasto] = useState(false);

    // Estado para cancelar invitación pendiente
    const [invitacionACancelar, setInvitacionACancelar] = useState(null);
    const [cancelandoInvitacionId, setCancelandoInvitacionId] = useState(null);

    // Estado para eliminar miembro
    const [miembroAEliminar, setMiembroAEliminar] = useState(null);
    const [eliminandoMiembro, setEliminandoMiembro] = useState(false);
    const [errorEliminarMiembro, setErrorEliminarMiembro] = useState(null);

    // Carga el grupo y sus miembros al montar (o al cambiar el :id)
    const cargarDatos = useCallback(async () => {
        if (!id) return;
        try {
            setCargando(true);
            setError(null);

            // Carga en paralelo para minimizar latencia
            const [grupoData, miembrosData] = await Promise.all([
                db.obtenerGrupoPorId(id),
                db.obtenerMiembrosDelGrupo(id),
            ]);

            setGrupo(grupoData);
            setMiembros(miembrosData || []);
        } catch (err) {
            console.error('Error al cargar el grupo:', err);
            // Si el grupo no existe (fue eliminado), redirigir a la lista sin mostrar error
            if (err.message?.includes('PGRST116') || err.message?.includes('JSON object requested')) {
                navigate('/grupos', { replace: true });
                return;
            }
            setError('No se pudo cargar el grupo. Verificá que exista o que tengas acceso.');
        } finally {
            setCargando(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        cargarDatos();
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sincroniza el tab cuando cambia el defaultTab (deep-link desde otra ruta)
    useEffect(() => {
        setTabActivo(defaultTab);
    }, [defaultTab]);

    // Carga los gastos del grupo cuando el tab de gastos se activa.
    // También carga las cuotas grupales activas para mostrar tarjeta y movimientos futuros.
    const cargarGastos = useCallback(async () => {
        if (!id) return;
        try {
            setCargandoGastos(true);
            const [datos, cuotas] = await Promise.all([
                db.obtenerGastosDelGrupo(id),
                db.obtenerCuotasGrupal(id),
            ]);
            setGastos(datos || []);
            setCuotasGrupo(cuotas || []);
        } catch (err) {
            console.error('Error al cargar gastos del grupo:', err);
        } finally {
            setCargandoGastos(false);
        }
    }, [id]);

    useEffect(() => {
        if (tabActivo === 'gastos') {
            cargarGastos();
        }
    }, [tabActivo, id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Carga invitaciones pendientes cuando se activa el tab Miembros
    const cargarInvitaciones = useCallback(async () => {
        if (!id) return;
        try {
            setCargandoInvitaciones(true);
            const data = await db.obtenerInvitacionesPendientes(id);
            setInvitacionesPendientes(data || []);
        } catch (err) {
            console.error('Error al cargar invitaciones pendientes:', err);
        } finally {
            setCargandoInvitaciones(false);
        }
    }, [id]);

    useEffect(() => {
        if (tabActivo === 'miembros') {
            cargarInvitaciones();
        }
    }, [tabActivo, id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Confirma y anula un gasto grupal
    const handleConfirmarAnular = async () => {
        if (!gastoAAnular) return;
        try {
            setAnulandoGasto(true);
            await db.anularGastoGrupal(gastoAAnular.id, id);
            setGastoAAnular(null);
            await cargarGastos();
        } catch (err) {
            console.error('Error al anular gasto:', err);
        } finally {
            setAnulandoGasto(false);
        }
    };

    // Confirma y cancela una invitación pendiente
    const handleConfirmarCancelarInvitacion = async () => {
        if (!invitacionACancelar) return;
        try {
            setCancelandoInvitacionId(invitacionACancelar.id);
            await db.cancelarInvitacion(invitacionACancelar.id);
            setInvitacionACancelar(null);
            await cargarInvitaciones();
        } catch (err) {
            console.error('Error al cancelar invitación:', err);
        } finally {
            setCancelandoInvitacionId(null);
        }
    };

    // Elimina un miembro del grupo (solo admin, solo si saldo neto = 0)
    const handleEliminarMiembro = async () => {
        if (!miembroAEliminar) return;
        try {
            setEliminandoMiembro(true);
            setErrorEliminarMiembro(null);

            // Verificar saldo antes de remover
            const saldos = await db.obtenerSaldosDelGrupo(id);
            const saldoMiembro = saldos.find((s) => s.user_id === miembroAEliminar.user_id);
            const saldoNeto = Number(saldoMiembro?.saldo_neto || 0);
            if (Math.abs(saldoNeto) > 0.009) {
                setErrorEliminarMiembro(
                    `${miembroAEliminar.alias || miembroAEliminar.nombre || 'El miembro'} tiene un saldo pendiente de $${saldoNeto.toFixed(2)}. Liquidá la deuda antes de eliminarlo.`
                );
                setMiembroAEliminar(null);
                return;
            }

            await db.removerMiembro(id, miembroAEliminar.user_id);
            setMiembroAEliminar(null);
            await cargarDatos();
        } catch (err) {
            console.error('Error al eliminar miembro:', err);
            setErrorEliminarMiembro(err.message || 'No se pudo eliminar el miembro.');
            setMiembroAEliminar(null);
        } finally {
            setEliminandoMiembro(false);
        }
    };

    // Elimina el grupo y redirige a /grupos
    const handleEliminarGrupo = async () => {
        try {
            setEliminandoGrupo(true);
            setErrorEliminar(null);
            await db.eliminarGrupo(grupo.id);
            navigate('/grupos', { replace: true });
        } catch (err) {
            console.error('Error al eliminar el grupo:', err);
            setErrorEliminar(err.message || 'No se pudo eliminar el grupo.');
            setMostrarEliminar(false);
        } finally {
            setEliminandoGrupo(false);
        }
    };

    // Formatea una fecha para mostrar al usuario (fallback '–' propio de esta página)
    const formatearFecha = (fecha) => (!fecha ? '–' : formatDate(fecha, { month: 'long' }));

    // Hooks SIEMPRE antes de cualquier return condicional
    const miembrosActivos = useMemo(
        () => miembros.filter((m) => m.estado === 'activo'),
        [miembros]
    );

    const esAdmin = useMemo(
        () => miembros.some((m) => m.user_id === user?.id && m.rol === 'admin' && m.estado === 'activo'),
        [miembros, user?.id]
    );

    const esMiembro = useMemo(
        () => miembros.some((m) => m.user_id === user?.id && m.estado === 'activo'),
        [miembros, user?.id]
    );

    // ── Estado de carga ──
    if (cargando) {
        return (
            <div className="grupos-page">
                <div className="grupos-page__loading">
                    <div className="loading-spinner" />
                    <p>Cargando grupo...</p>
                </div>
            </div>
        );
    }

    // ── Estado de error ──
    if (error || !grupo) {
        return (
            <div className="grupos-page">
                <div className="grupos-page__header">
                    <button
                        className="btn btn-ghost"
                        onClick={() => navigate('/grupos')}
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                        Volver
                    </button>
                </div>
                <div className="grupos-page__error">
                    <span className="material-symbols-outlined">error_outline</span>
                    {error || 'Grupo no encontrado.'}
                </div>
            </div>
        );
    }

    return (
        <div className="grupos-page">
            {/* Encabezado */}
            <div className="grupos-page__header">
                <button
                    className="btn btn-ghost"
                    onClick={() => navigate('/grupos')}
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                    Grupos
                </button>
                <div className="grupos-page__titulo-wrap">
                    <h1 className="grupos-page__titulo">{grupo.nombre}</h1>
                    {grupo.archivado && (
                        <span className="grupo-badge grupo-badge--archivado">Archivado</span>
                    )}
                </div>
            </div>

            {/* Banner de error al eliminar grupo */}
            {errorEliminar && (
                <div className="grupos-page__error-banner">
                    <span className="material-symbols-outlined">error_outline</span>
                    {errorEliminar}
                </div>
            )}

            {/* Banner de grupo archivado */}
            {grupo.archivado && (
                <div className="grupo-detalle__banner-archivado">
                    <span className="material-symbols-outlined">archive</span>
                    Este grupo está archivado. No se pueden agregar nuevos gastos.
                </div>
            )}

            {/* Tabs de navegación */}
            <GrupoTabs
                tabs={TABS}
                activeTab={tabActivo}
                onTabChange={setTabActivo}
            />

            {/* ── Tab: Resumen ── */}
            {tabActivo === 'resumen' && (
                <div className="grupo-detalle__panel">
                    <div className="glass-card grupo-detalle__info">
                        <dl className="grupo-detalle__dl">
                            {grupo.descripcion && (
                                <>
                                    <dt className="grupo-detalle__dt">Descripción</dt>
                                    <dd className="grupo-detalle__dd">{grupo.descripcion}</dd>
                                </>
                            )}
                            <dt className="grupo-detalle__dt">Moneda</dt>
                            <dd className="grupo-detalle__dd">{grupo.moneda || 'ARS'}</dd>

                            <dt className="grupo-detalle__dt">Estado</dt>
                            <dd className="grupo-detalle__dd">
                                {grupo.archivado ? 'Archivado' : 'Activo'}
                            </dd>

                            <dt className="grupo-detalle__dt">Creado el</dt>
                            <dd className="grupo-detalle__dd">{formatearFecha(grupo.fecha_creacion)}</dd>
                        </dl>
                    </div>

                    {/* Lista resumida de miembros */}
                    <div className="glass-card grupo-detalle__miembros-resumen">
                        <h2 className="grupo-detalle__subtitulo">
                            Miembros ({miembrosActivos.length})
                        </h2>
                        <div className="grupo-detalle__chips">
                            {miembrosActivos.map((m) => (
                                <MiembroChip key={m.id} miembro={m} />
                            ))}
                            {miembrosActivos.length === 0 && (
                                <p className="grupo-detalle__empty-msg">Sin miembros activos.</p>
                            )}
                        </div>
                    </div>

                    {/* Zona de peligro: eliminar grupo (cualquier miembro activo) */}
                    {esMiembro && (
                        <div className="glass-card grupo-detalle__zona-peligro">
                            <h2 className="grupo-detalle__subtitulo grupo-detalle__subtitulo--peligro">
                                Zona de peligro
                            </h2>
                            <p className="grupo-detalle__peligro-desc">
                                Solo podés eliminar el grupo si todos los saldos están en cero.
                                Esta acción es permanente e irreversible.
                            </p>
                            <button
                                className="btn btn-danger"
                                onClick={() => setMostrarEliminar(true)}
                            >
                                <span className="material-symbols-outlined">delete_forever</span>
                                Eliminar grupo
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Modal de confirmación de eliminación de grupo */}
            <ConfirmModal
                isOpen={mostrarEliminar}
                onClose={() => { setMostrarEliminar(false); setErrorEliminar(null); }}
                onConfirm={handleEliminarGrupo}
                loading={eliminandoGrupo}
                title="Eliminar grupo"
                message={`¿Estás seguro de que querés eliminar el grupo "${grupo?.nombre}"? Esta acción es permanente e irreversible.`}
            />

            {/* ── Tab: Gastos ── */}
            {tabActivo === 'gastos' && (
                <div className="grupo-detalle__panel">
                    {/* Botón "Cargar gasto" solo si el grupo no está archivado */}
                    {!grupo.archivado && (
                        <div className="grupo-detalle__tab-actions">
                            <button
                                className="btn btn-primary"
                                onClick={() => navigate(`/grupos/${grupo.id}/gastos/nuevo`)}
                            >
                                <span className="material-symbols-outlined">add</span>
                                Cargar gasto
                            </button>
                        </div>
                    )}

                    {/* Spinner mientras carga */}
                    {cargandoGastos ? (
                        <div className="grupos-page__loading">
                            <div className="loading-spinner" />
                            <p>Cargando gastos...</p>
                        </div>
                    ) : (
                        <>
                            {/* Card de cuotas grupales con tarjeta */}
                            <GrupoCuotasCard
                                grupos={cuotasGrupo}
                                miembros={miembros}
                                grupoId={grupo.id}
                                userId={user?.id}
                                onAnuladoExito={cargarGastos}
                            />

                            {/* Lista de gastos */}
                            {gastos.length === 0 ? (
                                <div className="glass-card grupo-detalle__placeholder">
                                    <span className="material-symbols-outlined grupo-detalle__placeholder-icon">
                                        receipt_long
                                    </span>
                                    <p>Todavía no hay gastos en este grupo.</p>
                                    {!grupo.archivado && (
                                        <p className="grupo-detalle__empty-msg">
                                            Usá el botón "Cargar gasto" para agregar el primero.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="glass-card grupo-detalle__gastos-lista">
                                    {gastos.map((gasto) => (
                                        <GrupoGastoRow
                                            key={gasto.id}
                                            gasto={gasto}
                                            miembros={miembros}
                                            userId={user?.id}
                                            esAdmin={esAdmin}
                                            onAnular={(gastoId) => setGastoAAnular(gastos.find(g => g.id === gastoId) ?? { id: gastoId })}
                                            grupoId={grupo.id}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── Tab: Miembros ── */}
            {tabActivo === 'miembros' && (
                <div className="grupo-detalle__panel">
                    {/* Botón "Invitar miembro" solo visible para admins */}
                    {esAdmin && (
                        <div className="grupo-detalle__tab-actions">
                            <button
                                className="btn btn-primary"
                                onClick={() => setMostrarInvitar(true)}
                            >
                                <span className="material-symbols-outlined">person_add</span>
                                Invitar miembro
                            </button>
                        </div>
                    )}

                    {/* Banner de error al eliminar miembro */}
                    {errorEliminarMiembro && (
                        <div className="grupos-page__error-banner">
                            <span className="material-symbols-outlined">error_outline</span>
                            {errorEliminarMiembro}
                            <button
                                className="btn btn-ghost"
                                style={{ marginLeft: 'auto', padding: '2px 8px' }}
                                onClick={() => setErrorEliminarMiembro(null)}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                    )}

                    <div className="glass-card">
                        <h2 className="grupo-detalle__subtitulo">
                            Miembros activos ({miembrosActivos.length})
                        </h2>
                        {miembrosActivos.length === 0 ? (
                            <p className="grupo-detalle__empty-msg">Sin miembros activos.</p>
                        ) : (
                            <ul className="grupo-detalle__miembros-lista">
                                {miembrosActivos.map((miembro) => (
                                    <li key={miembro.id} className="grupo-detalle__miembro-item">
                                        <MiembroChip miembro={miembro} />
                                        <span className="grupo-detalle__miembro-fecha">
                                            Desde {formatearFecha(miembro.fecha_alta)}
                                        </span>
                                        {/* Solo admin puede eliminar a otros miembros (no a sí mismo) */}
                                        {esAdmin && miembro.user_id !== user?.id && (
                                            <button
                                                className="btn btn-ghost grupo-detalle__btn-eliminar-miembro"
                                                title="Eliminar miembro del grupo"
                                                onClick={() => setMiembroAEliminar(miembro)}
                                            >
                                                <span className="material-symbols-outlined">person_remove</span>
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Invitaciones pendientes */}
                    {!cargandoInvitaciones && invitacionesPendientes.length > 0 && (
                        <div className="glass-card">
                            <h2 className="grupo-detalle__subtitulo">
                                Invitaciones pendientes ({invitacionesPendientes.length})
                            </h2>
                            <ul className="grupo-detalle__miembros-lista">
                                {invitacionesPendientes.map((inv) => (
                                    <li key={inv.id} className="grupo-detalle__miembro-item">
                                        <div className="miembro-chip">
                                            <div className="miembro-chip__avatar miembro-chip__avatar--pendiente">
                                                {inv.email_invitado.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="miembro-chip__nombre">{inv.email_invitado}</span>
                                            <span className="miembro-chip__badge miembro-chip__badge--pendiente">Pendiente</span>
                                        </div>
                                        <span className="grupo-detalle__miembro-fecha">
                                            Vence {formatearFecha(inv.fecha_expiracion)}
                                        </span>
                                        {/* Admin puede cancelar invitaciones pendientes */}
                                        {esAdmin && (
                                            <button
                                                className="btn btn-ghost grupo-detalle__btn-eliminar-miembro"
                                                title="Cancelar invitación"
                                                disabled={cancelandoInvitacionId === inv.id}
                                                onClick={() => setInvitacionACancelar(inv)}
                                            >
                                                {cancelandoInvitacionId === inv.id ? (
                                                    <div className="loading-spinner loading-spinner--sm" />
                                                ) : (
                                                    <span className="material-symbols-outlined">cancel</span>
                                                )}
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Modal de invitación — solo se monta si el usuario es admin */}
                    {esAdmin && (
                        <InvitarMiembroModal
                            grupoId={grupo.id}
                            isOpen={mostrarInvitar}
                            onClose={() => setMostrarInvitar(false)}
                            onExito={() => {
                                setMostrarInvitar(false);
                                cargarDatos();
                                cargarInvitaciones();
                            }}
                        />
                    )}
                </div>
            )}

            {/* ── Tab: Saldos ── */}
            {tabActivo === 'saldos' && (
                <div className="grupo-detalle__panel">
                    <GrupoSaldos grupoId={grupo.id} miembros={miembros} />
                </div>
            )}

            {/* Modal de confirmación de anular gasto grupal */}
            <ConfirmModal
                isOpen={!!gastoAAnular}
                onClose={() => setGastoAAnular(null)}
                onConfirm={handleConfirmarAnular}
                loading={anulandoGasto}
                title="Anular gasto"
                message={`¿Anulás el gasto "${gastoAAnular?.descripcion || ''}"? Esta acción no se puede deshacer.`}
            />

            {/* Modal de confirmación de cancelar invitación */}
            <ConfirmModal
                isOpen={!!invitacionACancelar}
                onClose={() => setInvitacionACancelar(null)}
                onConfirm={handleConfirmarCancelarInvitacion}
                loading={cancelandoInvitacionId === invitacionACancelar?.id}
                title="Cancelar invitación"
                message={`¿Cancelás la invitación enviada a ${invitacionACancelar?.email_invitado || ''}?`}
            />

            {/* Modal de confirmación de eliminación de miembro */}
            <ConfirmModal
                isOpen={!!miembroAEliminar}
                onClose={() => { setMiembroAEliminar(null); setErrorEliminarMiembro(null); }}
                onConfirm={handleEliminarMiembro}
                loading={eliminandoMiembro}
                title="Eliminar miembro"
                message={`¿Eliminás a ${miembroAEliminar?.alias || miembroAEliminar?.nombre || 'este miembro'} del grupo? Esta acción no se puede deshacer.`}
            />
        </div>
    );
};

export default GrupoDetalle;
