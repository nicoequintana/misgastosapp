import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNotificaciones } from '../context/NotificacionesContext';

/**
 * Íconos de Material Symbols para cada tipo de notificación.
 */
const ICONOS_TIPO = {
    success: 'check_circle',
    warning: 'warning',
    error:   'error',
    info:    'info',
};

/**
 * Formatea una fecha en formato legible relativo o absoluto.
 * Ej: "hace 5 minutos", "ayer", "12/05/2025"
 */
const formatearFecha = (fechaStr) => {
    if (!fechaStr) return '';
    const fecha  = new Date(fechaStr);
    const ahora  = new Date();
    const diffMs = ahora - fecha;
    const diffMin = Math.floor(diffMs / 60000);
    const diffH   = Math.floor(diffMs / 3600000);
    const diffD   = Math.floor(diffMs / 86400000);

    if (diffMin < 1)  return 'ahora mismo';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffH < 24)   return `hace ${diffH} h`;
    if (diffD === 1)  return 'ayer';
    if (diffD < 7)    return `hace ${diffD} días`;

    return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * Popup de detalle completo de una notificación.
 */
const NotificacionDetalle = ({ notificacion, onCerrar }) => {
    const { titulo, mensaje, tipo, fecha_creacion, email_enviado, origen } = notificacion;
    const icono = ICONOS_TIPO[tipo] || ICONOS_TIPO.info;

    // Cerrar con Escape — captura antes que el panel para no cerrar ambos
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCerrar();
            }
        };
        document.addEventListener('keydown', handleKey, true);
        return () => document.removeEventListener('keydown', handleKey, true);
    }, [onCerrar]);

    const popup = (
        <div className="notif-detalle-overlay" onMouseDown={onCerrar}>
            <div
                className={`notif-detalle-popup notif-detalle--${tipo}`}
                onMouseDown={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Detalle de notificación"
            >
                <div className="notif-detalle-header">
                    <div className={`notif-detalle-icono notif-detalle-icono--${tipo}`}>
                        <span className="material-symbols-outlined">{icono}</span>
                    </div>
                    <button className="notif-detalle-btn-cerrar" onClick={onCerrar} title="Cerrar">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="notif-detalle-body">
                    <p className="notif-detalle-titulo">{titulo}</p>
                    <p className="notif-detalle-mensaje">{mensaje}</p>
                </div>

                <div className="notif-detalle-footer">
                    <span className="notif-detalle-fecha">
                        <span className="material-symbols-outlined">schedule</span>
                        {formatearFecha(fecha_creacion)}
                    </span>
                    {origen && (
                        <span className="notif-detalle-origen">{origen}</span>
                    )}
                    {email_enviado && (
                        <span className="notif-detalle-email" title="Email enviado">
                            <span className="material-symbols-outlined">mark_email_read</span>
                            Email enviado
                        </span>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(popup, document.getElementById('modal-root'));
};

/**
 * Componente individual de notificación dentro del panel.
 */
const NotificacionItem = ({ notificacion, onLeer, onVerDetalle }) => {
    const { id, titulo, mensaje, tipo, leida, fecha_creacion, email_enviado } = notificacion;
    const icono = ICONOS_TIPO[tipo] || ICONOS_TIPO.info;

    const handleClick = () => {
        if (!leida) onLeer(id);
        onVerDetalle(notificacion);
    };

    return (
        <div
            className={`notif-item${leida ? ' notif-item--leida' : ''} notif-item--${tipo}`}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        >
            <div className="notif-item-icono">
                <span className="material-symbols-outlined">{icono}</span>
            </div>
            <div className="notif-item-body">
                <div className="notif-item-header">
                    <p className="notif-item-titulo">{titulo}</p>
                    {!leida && <span className="notif-item-dot" aria-label="No leída" />}
                </div>
                <p className="notif-item-mensaje">{mensaje}</p>
                <div className="notif-item-footer">
                    <span className="notif-item-fecha">{formatearFecha(fecha_creacion)}</span>
                    {email_enviado && (
                        <span className="notif-item-email-badge" title="Email enviado">
                            <span className="material-symbols-outlined">mail</span>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

/**
 * Panel principal de notificaciones.
 * Se renderiza con un portal para no afectar el layout del Header.
 * Se cierra al hacer click fuera o presionar Escape.
 */
const LIMITE_PANEL = 10;

const NotificacionesPanel = () => {
    const {
        notificaciones,
        noLeidas,
        cargando,
        panelAbierto,
        cerrarPanel,
        leerNotificacion,
        leerTodas,
    } = useNotificaciones();

    const [detalleAbierto, setDetalleAbierto] = useState(null);
    const panelRef = useRef(null);

    const ultimasDiez = notificaciones.slice(0, LIMITE_PANEL);

    // Cerrar al presionar Escape
    useEffect(() => {
        if (!panelAbierto) return;
        const handleKey = (e) => { if (e.key === 'Escape') cerrarPanel(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [panelAbierto, cerrarPanel]);

    // Cerrar al hacer click fuera del panel
    useEffect(() => {
        if (!panelAbierto) return;
        const handleClickOutside = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                // Verificar que el click no fue en el botón que abrió el panel
                if (!e.target.closest('.notif-trigger-btn')) {
                    cerrarPanel();
                }
            }
        };
        // Delay para no capturar el mismo click que abrió el panel
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 50);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [panelAbierto, cerrarPanel]);

    if (!panelAbierto) return null;

    const panel = (
        <div className="notif-panel-wrapper" ref={panelRef} role="dialog" aria-label="Panel de notificaciones">
            {/* Header del panel */}
            <div className="notif-panel-header">
                <div className="notif-panel-title-group">
                    <h3 className="notif-panel-title">Notificaciones</h3>
                    {noLeidas > 0 && (
                        <span className="notif-panel-badge">{noLeidas}</span>
                    )}
                </div>
                <div className="notif-panel-actions">
                    {noLeidas > 0 && (
                        <button
                            className="notif-btn-leer-todas"
                            onClick={leerTodas}
                            title="Marcar todas como leídas"
                        >
                            <span className="material-symbols-outlined">done_all</span>
                            <span>Leer todas</span>
                        </button>
                    )}
                    <button className="notif-btn-cerrar" onClick={cerrarPanel} title="Cerrar">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>

            {/* Lista de notificaciones */}
            <div className="notif-panel-lista">
                {cargando ? (
                    <div className="notif-empty-state">
                        <div className="loader mx-auto"></div>
                        <p>Cargando...</p>
                    </div>
                ) : notificaciones.length === 0 ? (
                    <div className="notif-empty-state">
                        <span className="material-symbols-outlined notif-empty-icon">notifications_off</span>
                        <p>Sin notificaciones</p>
                        <span className="notif-empty-sub">Tus alertas aparecerán aquí</span>
                    </div>
                ) : (
                    ultimasDiez.map(n => (
                        <NotificacionItem
                            key={n.id}
                            notificacion={n}
                            onLeer={leerNotificacion}
                            onVerDetalle={setDetalleAbierto}
                        />
                    ))
                )}
            </div>
        </div>
    );

    return (
        <>
            {createPortal(panel, document.getElementById('modal-root'))}
            {detalleAbierto && (
                <NotificacionDetalle
                    notificacion={detalleAbierto}
                    onCerrar={() => setDetalleAbierto(null)}
                />
            )}
        </>
    );
};

export default NotificacionesPanel;
