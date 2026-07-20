import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import { getReporteByRango } from '../lib/db';
import { formatCurrency } from '../utils/format';
import { limpiarSufijoCuota } from '../lib/cuotasGroupHelper';
import TarjetasCuotasCard from '../components/dashboard/TarjetasCuotasCard';

// ==================== HELPERS ====================

/**
 * Devuelve el rango de fechas (desde, hasta) según el período seleccionado.
 * @param {'mes_actual'|'mes_anterior'|'ultimos_3'|'ultimos_6'|'anio_actual'|'personalizado'} periodo
 * @returns {{ desde: string, hasta: string }}
 */
const calcularRango = (periodo) => {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes  = hoy.getMonth(); // 0-indexado

    const fmt = (d) => d.toISOString().split('T')[0];

    switch (periodo) {
        case 'mes_actual':
            return {
                desde: fmt(new Date(anio, mes, 1)),
                hasta: fmt(new Date(anio, mes + 1, 0)),
            };
        case 'mes_anterior': {
            const m = mes === 0 ? 11 : mes - 1;
            const a = mes === 0 ? anio - 1 : anio;
            return {
                desde: fmt(new Date(a, m, 1)),
                hasta: fmt(new Date(a, m + 1, 0)),
            };
        }
        case 'ultimos_3': {
            const inicio = new Date(anio, mes - 2, 1);
            return { desde: fmt(inicio), hasta: fmt(new Date(anio, mes + 1, 0)) };
        }
        case 'ultimos_6': {
            const inicio = new Date(anio, mes - 5, 1);
            return { desde: fmt(inicio), hasta: fmt(new Date(anio, mes + 1, 0)) };
        }
        case 'anio_actual':
            return {
                desde: fmt(new Date(anio, 0, 1)),
                hasta: fmt(new Date(anio, 11, 31)),
            };
        default:
            return { desde: '', hasta: '' };
    }
};

const PERIODOS = [
    { id: 'mes_actual',   label: 'Este mes' },
    { id: 'mes_anterior', label: 'Mes anterior' },
    { id: 'ultimos_3',    label: 'Últimos 3 meses' },
    { id: 'ultimos_6',    label: 'Últimos 6 meses' },
    { id: 'anio_actual',  label: 'Este año' },
    { id: 'personalizado', label: 'Personalizado' },
];

const COLORES = [
    '#137fec', '#10b981', '#fbbf24', '#fa6238',
    '#6366f1', '#ec4899', '#14b8a6', '#f97316',
    '#8b5cf6', '#06b6d4',
];

// ==================== SUB-COMPONENTES ====================

/**
 * Tarjeta de métrica simple: ícono + label + valor.
 */
const MetricCard = ({ label, value, icon, color = 'primary', subtitle }) => (
    <GlassCard className="reporte-metric-card">
        <div className="reporte-metric-icon" style={{
            background: `var(--${color}-light)`,
            color: `var(--${color})`,
        }}>
            <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div className="reporte-metric-body">
            <p className="reporte-metric-label">{label}</p>
            <p className="reporte-metric-value">${formatCurrency(value)}</p>
            {subtitle && <p className="reporte-metric-sub">{subtitle}</p>}
        </div>
    </GlassCard>
);

/**
 * Barra horizontal de progreso con etiqueta y porcentaje.
 */
const BarraCategoria = ({ nombre, total, porcentaje, color, rank }) => (
    <div className="reporte-barra-row">
        <div className="reporte-barra-header">
            <div className="reporte-barra-nombre">
                <span className="reporte-barra-rank">#{rank}</span>
                <span>{nombre}</span>
            </div>
            <div className="reporte-barra-right">
                <span className="reporte-barra-pct">{porcentaje.toFixed(1)}%</span>
                <span className="reporte-barra-total">${formatCurrency(total)}</span>
            </div>
        </div>
        <div className="reporte-barra-track">
            <div
                className="reporte-barra-fill"
                style={{ width: `${Math.min(porcentaje, 100)}%`, background: color }}
            />
        </div>
    </div>
);

const ResumenChip = ({ label, value, tone = 'neutral' }) => (
    <div className={`reportes-chip reportes-chip--${tone}`}>
        <span className="reportes-chip-label">{label}</span>
        <span className="reportes-chip-value">{value}</span>
    </div>
);

const MovimientoCard = ({ gasto }) => {
    // Agregamos T12:00:00 para evitar que la fecha cambie de día por desfase UTC en Argentina (UTC-3).
    const fechaStr = gasto.fecha || '';
    const fechaDate = fechaStr.includes('T') ? new Date(fechaStr) : new Date(`${fechaStr}T12:00:00`);
    const fecha = fechaDate.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });

    return (
        <article className="reporte-movimiento-card">
            <div className="reporte-movimiento-top">
                <div>
                    <p className="reporte-movimiento-fecha">{fecha}</p>
                    <h4 className="reporte-movimiento-desc">{gasto.descripcion}</h4>
                </div>
                <strong className="reporte-movimiento-monto">${formatCurrency(parseFloat(gasto.monto))}</strong>
            </div>

            <div className="reporte-movimiento-tags">
                <span className="reporte-tag">{gasto.categorias?.nombre || '—'}</span>
                <span className="reporte-tag reporte-tag--soft">{gasto.metodos_pago?.nombre || '—'}</span>
                <span className={`reporte-tipo-badge ${gasto.es_fijo ? 'reporte-tipo-badge--fijo' : 'reporte-tipo-badge--variable'}`}>
                    {gasto.es_fijo ? 'Fijo' : 'Variable'}
                </span>
            </div>
        </article>
    );
};

/**
 * Gráfico de barras verticales simple (CSS puro, sin librería).
 * Muestra evolución de gasto diario/mensual según el rango.
 */
const GraficoBarras = ({ porDia, desde, hasta }) => {
    // Construir serie de fechas del rango para el eje X
    const dias = useMemo(() => {
        const serie = [];
        const cur = new Date(`${desde}T12:00:00`);
        const fin = new Date(`${hasta}T12:00:00`);
        while (cur <= fin) {
            serie.push(cur.toISOString().split('T')[0]);
            cur.setDate(cur.getDate() + 1);
        }
        return serie;
    }, [desde, hasta]);

    const totales = dias.map(d => porDia[d]?.total || 0);

    // Si el rango es mayor a 60 días agrupamos por semana para no saturar el gráfico
    const agrupar = dias.length > 60;
    const grupos = useMemo(() => {
        if (!agrupar) {
            return dias.map((d, i) => ({ label: d, total: totales[i] }));
        }
        // Agrupar por semana (lunes como inicio)
        const mapa = {};
        dias.forEach((d, i) => {
            const fecha = new Date(`${d}T12:00:00`);
            const dia = fecha.getDay();
            const diffLunes = (dia + 6) % 7;
            const lunes = new Date(fecha);
            lunes.setDate(fecha.getDate() - diffLunes);
            const key = lunes.toISOString().split('T')[0];
            mapa[key] = (mapa[key] || 0) + totales[i];
        });
        return Object.entries(mapa).map(([label, total]) => ({ label, total }));
    }, [agrupar, dias, totales]);

    const maxGrupo = Math.max(...grupos.map(g => g.total), 1);

    // Formatear etiqueta del eje X: día/mes o semana
    const fmtLabel = (label) => {
        const d = new Date(`${label}T12:00:00`);
        return agrupar
            ? `${d.getDate()}/${d.getMonth() + 1}`
            : `${d.getDate()}`;
    };

    // Mostrar máximo 31 barras visibles; scroll horizontal si hay más
    const barras = grupos;

    return (
        <div className="reporte-grafico-wrap">
            <div className="reporte-grafico-barras" style={{ '--bar-count': barras.length }}>
                {barras.map((g, i) => {
                    const h = maxGrupo > 0 ? (g.total / maxGrupo) * 100 : 0;
                    return (
                        <div key={g.label} className="reporte-barra-col" title={`${g.label}: $${formatCurrency(g.total)}`}>
                            <div className="reporte-barra-col-fill" style={{ height: `${h}%`, background: COLORES[i % COLORES.length] }} />
                            <span className="reporte-barra-col-label">{fmtLabel(g.label)}</span>
                        </div>
                    );
                })}
            </div>
            <p className="reporte-grafico-nota">
                {agrupar ? 'Agrupado por semana' : 'Gasto diario'}
            </p>
        </div>
    );
};

/**
 * Dona SVG simple para distribución por categoría o método de pago.
 */
const GraficoDona = ({ datos, titulo }) => {
    const entradas = Object.entries(datos)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, 8);

    const total = entradas.reduce((s, [, v]) => s + v.total, 0);

    // Construir segmentos SVG acumulando el ángulo via reduce para no mutar variables en el map
    const radio = 80;
    const cx = 100;
    const cy = 100;
    const { segmentos } = entradas.reduce(
        (acc, [nombre, datosEntry], i) => {
            const pct = total > 0 ? datosEntry.total / total : 0;
            const grados = pct * 360;
            const rad1 = (acc.angulo * Math.PI) / 180;
            const rad2 = ((acc.angulo + grados) * Math.PI) / 180;
            const x1 = cx + radio * Math.cos(rad1);
            const y1 = cy + radio * Math.sin(rad1);
            const x2 = cx + radio * Math.cos(rad2);
            const y2 = cy + radio * Math.sin(rad2);
            const largeArc = grados > 180 ? 1 : 0;
            const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radio} ${radio} 0 ${largeArc} 1 ${x2} ${y2} Z`;
            acc.segmentos.push({ nombre, total: datosEntry.total, pct: pct * 100, path, color: COLORES[i % COLORES.length] });
            acc.angulo += grados;
            return acc;
        },
        { segmentos: [], angulo: -90 }
    );

    if (entradas.length === 0) {
        return (
            <div className="reporte-dona-empty">
                <span className="material-symbols-outlined">donut_large</span>
                <p>Sin datos</p>
            </div>
        );
    }

    return (
        <div className="reporte-dona-wrap">
            <p className="reporte-dona-titulo">{titulo}</p>
            <div className="reporte-dona-inner">
                <svg viewBox="0 0 200 200" className="reporte-dona-svg">
                    {segmentos.map(s => (
                        <path key={s.nombre} d={s.path} fill={s.color} stroke="var(--glass-bg)" strokeWidth="2">
                            <title>{s.nombre}: ${formatCurrency(s.total)} ({s.pct.toFixed(1)}%)</title>
                        </path>
                    ))}
                    {/* Agujero central */}
                    <circle cx={cx} cy={cy} r={48} fill="var(--glass-bg)" />
                    <text x={cx} y={cy - 6} textAnchor="middle" className="reporte-dona-center-label">Total</text>
                    <text x={cx} y={cy + 14} textAnchor="middle" className="reporte-dona-center-value">${formatCurrency(total)}</text>
                </svg>

                <div className="reporte-dona-leyenda">
                    {segmentos.map(s => (
                        <div key={s.nombre} className="reporte-dona-leyenda-item">
                            <span className="reporte-dona-leyenda-dot" style={{ background: s.color }} />
                            <span className="reporte-dona-leyenda-nombre">{s.nombre}</span>
                            <span className="reporte-dona-leyenda-pct">{s.pct.toFixed(1)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

/**
 * Tabla detallada de movimientos del período.
 */
const TablaMovimientos = ({ gastos }) => {
    const [pagina, setPagina] = useState(0);
    const POR_PAGINA = 15;
    const total = gastos.length;
    const totalPaginas = Math.ceil(total / POR_PAGINA);

    // Clampear la página actual sin useEffect para evitar renders en cascada
    const paginaActual = Math.min(pagina, Math.max(0, totalPaginas - 1));
    const slice = gastos.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA);

    if (total === 0) {
        return (
            <div className="reporte-tabla-empty">
                <span className="material-symbols-outlined">receipt_long</span>
                <p>No hay movimientos en el período seleccionado.</p>
            </div>
        );
    }

    return (
        <div className="reporte-tabla-wrap">
            <div className="reportes-movimientos-cards">
                {slice.map(g => (
                    <MovimientoCard key={g.id} gasto={g} />
                ))}
            </div>

            <div className="reporte-tabla-scroll">
                <table className="reporte-tabla">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Descripción</th>
                            <th>Categoría</th>
                            <th>Método</th>
                            <th>Tipo</th>
                            <th className="reporte-tabla-monto">Monto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slice.map(g => (
                            <tr key={g.id}>
                                <td className="reporte-tabla-fecha">
                                    {new Date(g.fecha?.includes('T') ? g.fecha : `${g.fecha}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                </td>
                                <td className="reporte-tabla-desc">{g.descripcion}</td>
                                <td>
                                    <span className="reporte-tag">{g.categorias?.nombre || '—'}</span>
                                </td>
                                <td className="reporte-tabla-metodo">{g.metodos_pago?.nombre || '—'}</td>
                                <td>
                                    <span className={`reporte-tipo-badge ${g.es_fijo ? 'reporte-tipo-badge--fijo' : 'reporte-tipo-badge--variable'}`}>
                                        {g.es_fijo ? 'Fijo' : 'Variable'}
                                    </span>
                                </td>
                                <td className="reporte-tabla-monto reporte-tabla-monto--val">
                                    ${formatCurrency(parseFloat(g.monto))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPaginas > 1 && (
                <div className="reporte-tabla-paginacion">
                    <button
                        className="btn btn-secondary reporte-pag-btn"
                        disabled={paginaActual === 0}
                        onClick={() => setPagina(p => Math.max(0, p - 1))}
                    >
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <span className="reporte-pag-info">
                        {paginaActual + 1} / {totalPaginas} — {total} movimientos
                    </span>
                    <button
                        className="btn btn-secondary reporte-pag-btn"
                        disabled={paginaActual >= totalPaginas - 1}
                        onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                    >
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>
            )}
        </div>
    );
};

// ==================== COMPONENTE PRINCIPAL ====================

const Reportes = () => {
    const [periodo, setPeriodo]     = useState('mes_actual');
    const [rango, setRango]         = useState(calcularRango('mes_actual'));
    const [reporte, setReporte]     = useState(null);
    const [cargando, setCargando]   = useState(false);
    const [error, setError]         = useState(null);

    const cargarReporte = useCallback(async (desde, hasta) => {
        if (!desde || !hasta || desde > hasta) return;
        setCargando(true);
        setError(null);
        try {
            const data = await getReporteByRango(desde, hasta);
            setReporte(data);
        } catch (err) {
            console.error('❌ Error al cargar reporte:', err);
            setError('No se pudo cargar el reporte. Intentá de nuevo.');
        } finally {
            setCargando(false);
        }
    }, []);

    // Cargar al montar y cuando cambia el rango
    useEffect(() => {
        cargarReporte(rango.desde, rango.hasta);
    }, [rango, cargarReporte]);

    const handlePeriodo = (p) => {
        setPeriodo(p);
        if (p !== 'personalizado') {
            setRango(calcularRango(p));
        }
    };

    const handleRangoPersonalizado = (campo, valor) => {
        setRango(prev => ({ ...prev, [campo]: valor }));
    };

    // Top categorías ordenadas por total
    const topCategorias = useMemo(() => {
        if (!reporte?.porCategoria) return [];
        return Object.entries(reporte.porCategoria)
            .map(([nombre, datos]) => ({ nombre, ...datos }))
            .sort((a, b) => b.total - a.total);
    }, [reporte]);

    const labelPeriodo = PERIODOS.find(p => p.id === periodo)?.label || '';

    // Agrupa los gastos con tarjeta de crédito en cuotas presentes en el reporte del período.
    // Usa la misma estructura que TarjetasCuotasCard para reutilizar el componente.
    const cuotasEnReporte = useMemo(() => {
        if (!reporte?.gastos) return [];
        const conCuotas = reporte.gastos.filter(
            g => g.id_gasto_padre != null &&
                 g.metodos_pago?.acepta_cuotas === true
        );
        if (conCuotas.length === 0) return [];

        const hoyStr = new Date().toISOString().split('T')[0];
        const grupos = conCuotas.reduce((acc, g) => {
            const k = g.id_gasto_padre;
            if (!acc[k]) acc[k] = [];
            acc[k].push(g);
            return acc;
        }, {});

        return Object.values(grupos).map(cuotas => {
            const ordenadas = [...cuotas].sort((a, b) => (a.numero_cuota ?? 0) - (b.numero_cuota ?? 0));
            const primera = ordenadas[0];
            const descripcionBase = limpiarSufijoCuota(primera.descripcion);
            const totalOriginal = ordenadas.reduce((s, c) => s + parseFloat(c.monto), 0);
            const pagadas = ordenadas.filter(c => (c.fecha || '').split('T')[0] <= hoyStr).length;
            return {
                id: primera.id_gasto_padre,
                descripcionBase,
                categoria: primera.categorias?.nombre || '—',
                totalOriginal,
                cuotas: ordenadas.length,
                pagadas,
                pendientes: ordenadas.length - pagadas,
                montoMensual: parseFloat(primera.monto),
                cuotasList: ordenadas,
            };
        }).sort((a, b) => a.pendientes - b.pendientes || a.descripcionBase.localeCompare(b.descripcionBase));
    }, [reporte]);

    // Días en el rango para calcular promedio diario
    const diasEnRango = useMemo(() => {
        if (!rango.desde || !rango.hasta) return 1;
        const diff = new Date(rango.hasta) - new Date(rango.desde);
        return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
    }, [rango]);

    const promedioDiario = reporte ? reporte.totalGastos / diasEnRango : 0;
    const porcentajeFijos = reporte && reporte.totalGastos > 0
        ? (reporte.gastosFijos / reporte.totalGastos) * 100
        : 0;
    const porcentajeVariables = reporte && reporte.totalGastos > 0
        ? (reporte.gastosVariables / reporte.totalGastos) * 100
        : 0;

    const hayDatos = Boolean(reporte?.gastos?.length);

    return (
        <div className="reportes-page">

            {/* ── ENCABEZADO Y SELECTOR DE PERÍODO ─────────────── */}
            <GlassCard className="reportes-header-card">
                <div className="reportes-hero-shell">
                    <div className="reportes-hero-copy">
                        <p className="reportes-eyebrow">Atlas financiero</p>
                        <h2 className="reportes-titulo">Reportes</h2>
                        <p className="reportes-subtitulo">
                            Analizá tus gastos por período con una lectura clara, visual y lista para usar en cualquier pantalla.
                        </p>
                        <div className="reportes-chip-row">
                            <ResumenChip label={labelPeriodo} value={rango.desde && rango.hasta ? `${new Date(`${rango.desde}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })} → ${new Date(`${rango.hasta}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}` : 'Rango activo'} tone="primary" />
                            <ResumenChip label="Movimientos" value={reporte ? `${reporte.gastos.length}` : '—'} />
                            <ResumenChip label="Promedio diario" value={`$${formatCurrency(promedioDiario)}`} tone="secondary" />
                        </div>
                    </div>
                    <div className="reportes-hero-aside">
                        {reporte && !cargando && (
                            <div className="reportes-header-badge">
                                <span className="material-symbols-outlined">receipt_long</span>
                                {reporte.gastos.length} movimientos
                            </div>
                        )}
                        <div className="reportes-periodos">
                            {PERIODOS.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={`reportes-periodo-btn${periodo === p.id ? ' reportes-periodo-btn--active' : ''}`}
                                    onClick={() => handlePeriodo(p.id)}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Rango personalizado */}
                {periodo === 'personalizado' && (
                    <div className="reportes-rango-custom">
                        <div className="form-group">
                            <label className="form-label-box">Desde</label>
                            <input
                                type="date"
                                className="input"
                                value={rango.desde}
                                max={rango.hasta}
                                onChange={e => handleRangoPersonalizado('desde', e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Hasta</label>
                            <input
                                type="date"
                                className="input"
                                value={rango.hasta}
                                min={rango.desde}
                                onChange={e => handleRangoPersonalizado('hasta', e.target.value)}
                            />
                        </div>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => cargarReporte(rango.desde, rango.hasta)}
                        >
                            <span className="material-symbols-outlined">search</span>
                            Aplicar
                        </button>
                    </div>
                )}

                {/* Rango activo en texto */}
                {rango.desde && rango.hasta && (
                    <p className="reportes-rango-label">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle' }}>calendar_month</span>
                        &nbsp;{new Date(`${rango.desde}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        &nbsp;→&nbsp;
                        {new Date(`${rango.hasta}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                )}
            </GlassCard>

            {/* ── ESTADO DE CARGA Y ERROR ───────────────────────── */}
            {cargando && (
                <div className="reportes-loading">
                    <span className="material-symbols-outlined reportes-loading-icon">query_stats</span>
                    <p>Calculando reporte...</p>
                </div>
            )}

            {error && !cargando && (
                <div className="reportes-error">{error}</div>
            )}

            {/* ── CONTENIDO DEL REPORTE ─────────────────────────── */}
            {reporte && !cargando && !error && hayDatos && (
                <>
                    {/* Métricas principales */}
                    <div className="reportes-metrics-grid">
                        <MetricCard
                            label="Total gastado"
                            value={reporte.totalGastos}
                            icon="payments"
                            color="danger"
                            subtitle={labelPeriodo}
                        />
                        <MetricCard
                            label="Gastos fijos"
                            value={reporte.gastosFijos}
                            icon="lock"
                            color="warning"
                            subtitle={reporte.totalGastos > 0
                                ? `${((reporte.gastosFijos / reporte.totalGastos) * 100).toFixed(1)}% del total`
                                : '0% del total'}
                        />
                        <MetricCard
                            label="Gastos variables"
                            value={reporte.gastosVariables}
                            icon="autorenew"
                            color="primary"
                            subtitle={reporte.totalGastos > 0
                                ? `${((reporte.gastosVariables / reporte.totalGastos) * 100).toFixed(1)}% del total`
                                : '0% del total'}
                        />
                        <MetricCard
                            label="Promedio diario"
                            value={promedioDiario}
                            icon="today"
                            color="secondary"
                            subtitle={`En ${diasEnRango} día${diasEnRango > 1 ? 's' : ''}`}
                        />
                    </div>

                    {/* Gráfico de evolución + dona de categorías */}
                    <div className="reportes-graficos-grid">
                        <GlassCard className="reportes-grafico-card">
                            <h3 className="reportes-card-titulo">
                                <span className="material-symbols-outlined">bar_chart</span>
                                Evolución de gastos
                            </h3>
                            <GraficoBarras porDia={reporte.porDia} desde={rango.desde} hasta={rango.hasta} />
                        </GlassCard>

                        <GlassCard className="reportes-grafico-card">
                            <h3 className="reportes-card-titulo">
                                <span className="material-symbols-outlined">donut_large</span>
                                Por categoría
                            </h3>
                            <GraficoDona datos={reporte.porCategoria} titulo="Distribución por categoría" />
                        </GlassCard>
                    </div>

                    {/* Barras horizontales de categorías */}
                    <GlassCard className="reportes-barras-card">
                        <h3 className="reportes-card-titulo">
                            <span className="material-symbols-outlined">leaderboard</span>
                            Ranking de categorías
                        </h3>
                        <div className="reportes-mini-summary">
                            <ResumenChip label="Fijos" value={`${porcentajeFijos.toFixed(1)}%`} tone="warning" />
                            <ResumenChip label="Variables" value={`${porcentajeVariables.toFixed(1)}%`} tone="success" />
                            <ResumenChip label="Categorías" value={`${topCategorias.length}`} />
                        </div>
                        {topCategorias.length === 0 ? (
                            <p className="reportes-empty-text">Sin datos en el período.</p>
                        ) : (
                            <div className="reportes-barras-lista">
                                {topCategorias.map((cat, i) => (
                                    <BarraCategoria
                                        key={cat.nombre}
                                        nombre={cat.nombre}
                                        total={cat.total}
                                        porcentaje={cat.porcentaje}
                                        color={COLORES[i % COLORES.length]}
                                        rank={i + 1}
                                    />
                                ))}
                            </div>
                        )}
                    </GlassCard>

                    {/* Dona de métodos de pago */}
                    <GlassCard className="reportes-grafico-card reportes-metodo-card">
                        <h3 className="reportes-card-titulo">
                            <span className="material-symbols-outlined">credit_card</span>
                            Por método de pago
                        </h3>
                        <GraficoDona datos={reporte.porMetodoPago} titulo="Distribución por método de pago" />
                    </GlassCard>

                    {/* Tabla de movimientos */}
                    <GlassCard className="reportes-tabla-card">
                        <h3 className="reportes-card-titulo">
                            <span className="material-symbols-outlined">table_rows</span>
                            Movimientos del período
                        </h3>
                        <div className="reportes-tabla-kicker">
                            <ResumenChip label="Total" value={`${reporte.gastos.length}`} />
                            <ResumenChip label="Fijos" value={`${reporte.gastos.filter(g => g.es_fijo).length}`} tone="warning" />
                            <ResumenChip label="Variables" value={`${reporte.gastos.filter(g => !g.es_fijo).length}`} tone="success" />
                        </div>
                        <TablaMovimientos gastos={reporte.gastos} />
                    </GlassCard>

                    {/* Cuotas con tarjeta de crédito presentes en el período */}
                    {cuotasEnReporte.length > 0 && (
                        <TarjetasCuotasCard grupos={cuotasEnReporte} />
                    )}
                </>
            )}

            {/* Estado vacío */}
            {reporte && !cargando && !error && !hayDatos && (
                <GlassCard className="reportes-vacio">
                    <span className="material-symbols-outlined reportes-vacio-icon">search_off</span>
                    <p>No hay gastos registrados en el período seleccionado.</p>
                </GlassCard>
            )}
        </div>
    );
};

export default Reportes;
