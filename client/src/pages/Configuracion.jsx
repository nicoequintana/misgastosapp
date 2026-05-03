import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme, THEMES } from '../context/ThemeContext';
import GlassCard from '../components/GlassCard';
import { useNotificaciones } from '../context/NotificacionesContext';

/**
 * Página de configuración: perfil del usuario y selector de tema visual.
 */
const Configuracion = () => {
    const { user } = useAuth();
    const { themeId, applyTheme } = useTheme();
    const { config, guardarConfig } = useNotificaciones();

    const [guardandoConfig, setGuardandoConfig] = useState(false);
    const [mensajeConfig, setMensajeConfig] = useState('');
    // Estado local del formulario de config (copia del contexto para edición)
    const [formConfig, setFormConfig] = useState(null);

    // Inicializar formConfig cuando el contexto carga la config real
    React.useEffect(() => {
        if (config) setFormConfig({ ...config });
    }, [config]);

    const handleToggle = (campo) => {
        setFormConfig(prev => ({ ...prev, [campo]: !prev[campo] }));
    };

    const handleNumero = (campo, valor) => {
        const num = Number(valor);
        if (!isNaN(num) && num >= 0) {
            setFormConfig(prev => ({ ...prev, [campo]: num }));
        }
    };

    const handleGuardarConfig = async () => {
        if (!formConfig) return;
        setGuardandoConfig(true);
        setMensajeConfig('');
        try {
            await guardarConfig(formConfig);
            setMensajeConfig('Configuración guardada correctamente.');
        } catch {
            setMensajeConfig('Error al guardar. Intentá de nuevo.');
        } finally {
            setGuardandoConfig(false);
            setTimeout(() => setMensajeConfig(''), 3000);
        }
    };

    const nombre = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuario';
    const email = user?.email || '—';
    const avatar = user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;
    const telefono = user?.user_metadata?.phone || null;

    const lightThemes = THEMES.filter(t => t.mode === 'light');
    const darkThemes = THEMES.filter(t => t.mode === 'dark');

    return (
        <div className="config-page">

            {/* ── PERFIL ─────────────────────────────── */}
            <GlassCard className="config-section">
                <div className="config-section-header">
                    <span className="material-symbols-outlined config-section-icon">person</span>
                    <h3 className="config-section-title">Perfil</h3>
                </div>

                <div className="profile-block">
                    <div className="profile-avatar-wrap">
                        <img src={avatar} alt={nombre} className="profile-avatar" />
                        <span className="profile-avatar-badge">
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>verified</span>
                        </span>
                    </div>

                    <div className="profile-info">
                        <p className="profile-name">{nombre}</p>
                        <p className="profile-email">{email}</p>
                        {telefono && <p className="profile-phone">{telefono}</p>}
                        <div className="profile-provider-badge">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            <span>Google Account</span>
                        </div>
                    </div>
                </div>
            </GlassCard>

            {/* ── TEMAS ──────────────────────────────── */}
            <GlassCard className="config-section">
                <div className="config-section-header">
                    <span className="material-symbols-outlined config-section-icon">palette</span>
                    <h3 className="config-section-title">Apariencia</h3>
                </div>

                <div className="theme-group">
                    <p className="theme-group-label">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>light_mode</span>
                        &nbsp;Modo claro
                    </p>
                    <div className="theme-grid">
                        {lightThemes.map(theme => (
                            <ThemeCard key={theme.id} theme={theme} active={themeId === theme.id} onSelect={applyTheme} />
                        ))}
                    </div>
                </div>

                <div className="theme-group">
                    <p className="theme-group-label">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>dark_mode</span>
                        &nbsp;Modo oscuro
                    </p>
                    <div className="theme-grid">
                        {darkThemes.map(theme => (
                            <ThemeCard key={theme.id} theme={theme} active={themeId === theme.id} onSelect={applyTheme} />
                        ))}
                    </div>
                </div>
            </GlassCard>

            {/* ── NOTIFICACIONES ─────────────────────── */}
            {formConfig && (
                <GlassCard className="config-section">
                    <div className="config-section-header">
                        <span className="material-symbols-outlined config-section-icon">notifications</span>
                        <h3 className="config-section-title">Notificaciones</h3>
                    </div>

                    {/* Alertas financieras */}
                    <div className="notif-config-group">
                        <p className="notif-config-group-label">Alertas financieras</p>

                        <div className="notif-config-row">
                            <div className="notif-config-info">
                                <span className="notif-config-row-title">Saldo disponible bajo</span>
                                <span className="notif-config-row-desc">Avisar cuando el saldo quede por debajo del umbral</span>
                            </div>
                            <button
                                type="button"
                                className={`notif-toggle${formConfig.notificar_saldo_bajo ? ' notif-toggle--on' : ''}`}
                                onClick={() => handleToggle('notificar_saldo_bajo')}
                                aria-pressed={formConfig.notificar_saldo_bajo}
                            >
                                <span className="notif-toggle-thumb" />
                            </button>
                        </div>

                        {formConfig.notificar_saldo_bajo && (
                            <div className="notif-config-sub">
                                <label className="notif-config-sub-label">Umbral de saldo bajo ($)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formConfig.umbral_saldo_bajo}
                                    onChange={(e) => handleNumero('umbral_saldo_bajo', e.target.value)}
                                    className="input notif-config-input"
                                />
                            </div>
                        )}

                        <div className="notif-config-row">
                            <div className="notif-config-info">
                                <span className="notif-config-row-title">Límite de porcentaje del ingreso</span>
                                <span className="notif-config-row-desc">Avisar cuando los gastos superen un % del ingreso</span>
                            </div>
                            <button
                                type="button"
                                className={`notif-toggle${formConfig.notificar_porcentaje_ingreso ? ' notif-toggle--on' : ''}`}
                                onClick={() => handleToggle('notificar_porcentaje_ingreso')}
                                aria-pressed={formConfig.notificar_porcentaje_ingreso}
                            >
                                <span className="notif-toggle-thumb" />
                            </button>
                        </div>

                        {formConfig.notificar_porcentaje_ingreso && (
                            <div className="notif-config-sub">
                                <label className="notif-config-sub-label">Porcentaje máximo (%)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={formConfig.porcentaje_maximo_ingreso}
                                    onChange={(e) => handleNumero('porcentaje_maximo_ingreso', e.target.value)}
                                    className="input notif-config-input"
                                />
                            </div>
                        )}

                        <div className="notif-config-row">
                            <div className="notif-config-info">
                                <span className="notif-config-row-title">Gasto alto</span>
                                <span className="notif-config-row-desc">Avisar cuando un gasto individual supere el umbral</span>
                            </div>
                            <button
                                type="button"
                                className={`notif-toggle${formConfig.notificar_gasto_alto ? ' notif-toggle--on' : ''}`}
                                onClick={() => handleToggle('notificar_gasto_alto')}
                                aria-pressed={formConfig.notificar_gasto_alto}
                            >
                                <span className="notif-toggle-thumb" />
                            </button>
                        </div>

                        {formConfig.notificar_gasto_alto && (
                            <div className="notif-config-sub">
                                <label className="notif-config-sub-label">Monto de gasto alto ($)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formConfig.monto_gasto_alto}
                                    onChange={(e) => handleNumero('monto_gasto_alto', e.target.value)}
                                    className="input notif-config-input"
                                />
                            </div>
                        )}
                    </div>

                    {/* Alertas de gastos fijos y variables (Fase 4) */}
                    <div className="notif-config-group">
                        <p className="notif-config-group-label">Gastos fijos y variables</p>

                        <div className="notif-config-row">
                            <div className="notif-config-info">
                                <span className="notif-config-row-title">Gastos fijos pendientes</span>
                                <span className="notif-config-row-desc">Avisar si este mes tenés menos gastos fijos que el anterior</span>
                            </div>
                            <button
                                type="button"
                                className={`notif-toggle${formConfig.notificar_gastos_fijos_pendientes ? ' notif-toggle--on' : ''}`}
                                onClick={() => handleToggle('notificar_gastos_fijos_pendientes')}
                                aria-pressed={formConfig.notificar_gastos_fijos_pendientes}
                            >
                                <span className="notif-toggle-thumb" />
                            </button>
                        </div>

                        <div className="notif-config-row">
                            <div className="notif-config-info">
                                <span className="notif-config-row-title">Gastos fijos elevados</span>
                                <span className="notif-config-row-desc">Avisar cuando los gastos fijos superen un % del ingreso</span>
                            </div>
                            <button
                                type="button"
                                className={`notif-toggle${formConfig.notificar_gastos_fijos_exceso ? ' notif-toggle--on' : ''}`}
                                onClick={() => handleToggle('notificar_gastos_fijos_exceso')}
                                aria-pressed={formConfig.notificar_gastos_fijos_exceso}
                            >
                                <span className="notif-toggle-thumb" />
                            </button>
                        </div>

                        {formConfig.notificar_gastos_fijos_exceso && (
                            <div className="notif-config-sub">
                                <label className="notif-config-sub-label">Umbral de gastos fijos sobre ingreso (%)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={formConfig.umbral_fijos_ingreso}
                                    onChange={(e) => handleNumero('umbral_fijos_ingreso', e.target.value)}
                                    className="input notif-config-input"
                                />
                            </div>
                        )}

                        <div className="notif-config-row">
                            <div className="notif-config-info">
                                <span className="notif-config-row-title">Crecimiento de gastos variables</span>
                                <span className="notif-config-row-desc">Avisar cuando los variables suban más de lo habitual respecto al mes anterior</span>
                            </div>
                            <button
                                type="button"
                                className={`notif-toggle${formConfig.notificar_variables_crecimiento ? ' notif-toggle--on' : ''}`}
                                onClick={() => handleToggle('notificar_variables_crecimiento')}
                                aria-pressed={formConfig.notificar_variables_crecimiento}
                            >
                                <span className="notif-toggle-thumb" />
                            </button>
                        </div>

                        {formConfig.notificar_variables_crecimiento && (
                            <div className="notif-config-sub">
                                <label className="notif-config-sub-label">Margen de crecimiento aceptable (%)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="200"
                                    value={formConfig.margen_crecimiento_variables}
                                    onChange={(e) => handleNumero('margen_crecimiento_variables', e.target.value)}
                                    className="input notif-config-input"
                                />
                            </div>
                        )}

                        <div className="notif-config-row">
                            <div className="notif-config-info">
                                <span className="notif-config-row-title">Concentración por categoría</span>
                                <span className="notif-config-row-desc">Avisar cuando una categoría concentra demasiado del gasto total</span>
                            </div>
                            <button
                                type="button"
                                className={`notif-toggle${formConfig.notificar_concentracion_categoria ? ' notif-toggle--on' : ''}`}
                                onClick={() => handleToggle('notificar_concentracion_categoria')}
                                aria-pressed={formConfig.notificar_concentracion_categoria}
                            >
                                <span className="notif-toggle-thumb" />
                            </button>
                        </div>

                        {formConfig.notificar_concentracion_categoria && (
                            <div className="notif-config-sub">
                                <label className="notif-config-sub-label">Porcentaje de concentración máximo (%)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={formConfig.porcentaje_concentracion_categoria}
                                    onChange={(e) => handleNumero('porcentaje_concentracion_categoria', e.target.value)}
                                    className="input notif-config-input"
                                />
                            </div>
                        )}
                    </div>

                    {/* Proyecciones y resúmenes (Fase 5) */}
                    <div className="notif-config-group">
                        <p className="notif-config-group-label">Proyecciones</p>

                        <div className="notif-config-row">
                            <div className="notif-config-info">
                                <span className="notif-config-row-title">Proyecciones financieras</span>
                                <span className="notif-config-row-desc">Avisar si el saldo proyectado queda negativo o el ahorro está en riesgo</span>
                            </div>
                            <button
                                type="button"
                                className={`notif-toggle${formConfig.notificar_proyecciones ? ' notif-toggle--on' : ''}`}
                                onClick={() => handleToggle('notificar_proyecciones')}
                                aria-pressed={formConfig.notificar_proyecciones}
                            >
                                <span className="notif-toggle-thumb" />
                            </button>
                        </div>

                        {formConfig.notificar_proyecciones && (
                            <div className="notif-config-sub">
                                <label className="notif-config-sub-label">Objetivo de ahorro mensual (%)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={formConfig.objetivo_ahorro_porcentaje}
                                    onChange={(e) => handleNumero('objetivo_ahorro_porcentaje', e.target.value)}
                                    className="input notif-config-input"
                                />
                            </div>
                        )}
                    </div>

                    {/* Email */}
                    <div className="notif-config-group">
                        <p className="notif-config-group-label">Email</p>

                        <div className="notif-config-row">
                            <div className="notif-config-info">
                                <span className="notif-config-row-title">Envío de emails habilitado</span>
                                <span className="notif-config-row-desc">Recibir notificaciones importantes por email</span>
                            </div>
                            <button
                                type="button"
                                className={`notif-toggle${formConfig.email_habilitado ? ' notif-toggle--on' : ''}`}
                                onClick={() => handleToggle('email_habilitado')}
                                aria-pressed={formConfig.email_habilitado}
                            >
                                <span className="notif-toggle-thumb" />
                            </button>
                        </div>

                        {formConfig.email_habilitado && (
                            <>
                                <div className="notif-config-row notif-config-row--sub">
                                    <span className="notif-config-row-title">Email por saldo bajo</span>
                                    <button
                                        type="button"
                                        className={`notif-toggle notif-toggle--sm${formConfig.email_saldo_bajo ? ' notif-toggle--on' : ''}`}
                                        onClick={() => handleToggle('email_saldo_bajo')}
                                    >
                                        <span className="notif-toggle-thumb" />
                                    </button>
                                </div>
                                <div className="notif-config-row notif-config-row--sub">
                                    <span className="notif-config-row-title">Email por gasto alto</span>
                                    <button
                                        type="button"
                                        className={`notif-toggle notif-toggle--sm${formConfig.email_gasto_alto ? ' notif-toggle--on' : ''}`}
                                        onClick={() => handleToggle('email_gasto_alto')}
                                    >
                                        <span className="notif-toggle-thumb" />
                                    </button>
                                </div>
                                <div className="notif-config-row notif-config-row--sub">
                                    <span className="notif-config-row-title">Email por integraciones n8n/WhatsApp</span>
                                    <button
                                        type="button"
                                        className={`notif-toggle notif-toggle--sm${formConfig.email_notificaciones_n8n ? ' notif-toggle--on' : ''}`}
                                        onClick={() => handleToggle('email_notificaciones_n8n')}
                                    >
                                        <span className="notif-toggle-thumb" />
                                    </button>
                                </div>
                                <div className="notif-config-row notif-config-row--sub">
                                    <span className="notif-config-row-title">Email por alertas de gastos fijos</span>
                                    <button
                                        type="button"
                                        className={`notif-toggle notif-toggle--sm${formConfig.email_alertas_gastos_fijos ? ' notif-toggle--on' : ''}`}
                                        onClick={() => handleToggle('email_alertas_gastos_fijos')}
                                    >
                                        <span className="notif-toggle-thumb" />
                                    </button>
                                </div>
                                <div className="notif-config-row notif-config-row--sub">
                                    <span className="notif-config-row-title">Email con resumen diario</span>
                                    <button
                                        type="button"
                                        className={`notif-toggle notif-toggle--sm${formConfig.email_resumen_diario ? ' notif-toggle--on' : ''}`}
                                        onClick={() => handleToggle('email_resumen_diario')}
                                    >
                                        <span className="notif-toggle-thumb" />
                                    </button>
                                </div>
                                <div className="notif-config-row notif-config-row--sub">
                                    <span className="notif-config-row-title">Email con resumen semanal</span>
                                    <button
                                        type="button"
                                        className={`notif-toggle notif-toggle--sm${formConfig.email_resumen_semanal ? ' notif-toggle--on' : ''}`}
                                        onClick={() => handleToggle('email_resumen_semanal')}
                                    >
                                        <span className="notif-toggle-thumb" />
                                    </button>
                                </div>
                                <div className="notif-config-row notif-config-row--sub">
                                    <span className="notif-config-row-title">Email con resumen mensual</span>
                                    <button
                                        type="button"
                                        className={`notif-toggle notif-toggle--sm${formConfig.email_resumen_mensual ? ' notif-toggle--on' : ''}`}
                                        onClick={() => handleToggle('email_resumen_mensual')}
                                    >
                                        <span className="notif-toggle-thumb" />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Botón guardar */}
                    <div className="notif-config-footer">
                        {mensajeConfig && (
                            <span className={`notif-config-msg${mensajeConfig.includes('Error') ? ' notif-config-msg--error' : ' notif-config-msg--ok'}`}>
                                {mensajeConfig}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleGuardarConfig}
                            disabled={guardandoConfig}
                            className="btn btn-primary"
                        >
                            {guardandoConfig ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </GlassCard>
            )}

        </div>
    );
};

const ThemeCard = ({ theme, active, onSelect }) => (
    <button
        className={`theme-card ${active ? 'theme-card--active' : ''}`}
        onClick={() => onSelect(theme.id)}
        title={theme.label}
    >
        <div className="theme-card-preview">
            <div className="theme-swatch" style={{ background: theme.preview[1] }}>
                <div className="theme-swatch-accent" style={{ background: theme.preview[0] }} />
            </div>
        </div>
        <span className="theme-card-label">{theme.label}</span>
        {active && (
            <span className="theme-card-check">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
            </span>
        )}
    </button>
);

export default Configuracion;
