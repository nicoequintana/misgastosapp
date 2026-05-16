import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import GrupoTabs from '../../components/grupos/GrupoTabs';
import MiembroChip from '../../components/grupos/MiembroChip';
import GrupoGastoRow from '../../components/grupos/GrupoGastoRow';
import GrupoCuotasCard from '../../components/grupos/GrupoCuotasCard';
import GrupoSaldos from './GrupoSaldos';
import InvitarMiembroModal from '../../components/grupos/InvitarMiembroModal';
import ConfirmModal from '../../components/ConfirmModal';
import { AuthContext } from '../../context/AuthContext';
import * as db from '../../lib/db';

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
    const { user } = useContext(AuthContext);

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

    // Anula un gasto grupal y recarga la lista
    const handleAnular = async (gastoId) => {
        await db.anularGastoGrupal(gastoId, id);
        // Recargamos los gastos para reflejar el cambio de estado
        await cargarGastos();
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

    // Formatea una fecha para mostrar al usuario
    const formatearFecha = (fecha) => {
        if (!fecha) return '–';
        const fechaStr = String(fecha).split('T')[0];
        return new Date(`${fechaStr}T12:00:00Z`).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            timeZone: 'America/Argentina/Buenos_Aires',
        });
    };

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

    // Cuotas con fecha > hoy: se muestran como "Movimientos futuros", no afectan saldo
    const hoyStr = new Date().toISOString().split('T')[0];
    const movimientosFuturos = useMemo(() => {
        return cuotasGrupo.flatMap(g =>
            g.cuotasList.filter(c => (c.fecha || '').split('T')[0] > hoyStr)
        ).sort((a, b) => a.fecha.localeCompare(b.fecha));
    }, [cuotasGrupo, hoyStr]);

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

                            {/* Movimientos futuros: cuotas que aún no vencieron */}
                            {movimientosFuturos.length > 0 && (
                                <div className="glass-card grupo-detalle__futuros">
                                    <div className="grupo-detalle__futuros-header">
                                        <span className="material-symbols-outlined">schedule</span>
                                        <h3 className="table-title">Movimientos futuros</h3>
                                        <span className="category-tag counter">{movimientosFuturos.length}</span>
                                    </div>
                                    <p className="grupo-detalle__futuros-desc">
                                        Estas cuotas aún no vencieron y no afectan el saldo actual del grupo.
                                    </p>
                                    <div className="grupo-detalle__futuros-lista">
                                        {movimientosFuturos.map((c) => {
                                            const fechaStr = (c.fecha || '').split('T')[0];
                                            const fecha = new Date(`${fechaStr}T12:00:00`).toLocaleDateString('es-AR', {
                                                day: '2-digit', month: 'long', year: 'numeric',
                                            });
                                            const descBase = c.descripcion.replace(/\s*\(\d+\/\d+\)$/, '');
                                            return (
                                                <div key={c.id} className="grupo-detalle__futuro-row">
                                                    <span className="material-symbols-outlined grupo-detalle__futuro-icon">
                                                        credit_card
                                                    </span>
                                                    <div className="grupo-detalle__futuro-info">
                                                        <span className="grupo-detalle__futuro-desc">{descBase}</span>
                                                        <span className="grupo-detalle__futuro-cuota">{c.descripcion.match(/\(\d+\/\d+\)/)?.[0]}</span>
                                                    </div>
                                                    <span className="grupo-detalle__futuro-fecha">{fecha}</span>
                                                    <span className="grupo-detalle__futuro-monto">
                                                        ${(c.monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

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
                                            onAnular={handleAnular}
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
        </div>
    );
};

export default GrupoDetalle;
