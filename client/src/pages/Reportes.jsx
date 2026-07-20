import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import { getReporteByRango } from '../lib/db';
import { formatCurrency } from '../utils/format';
import { limpiarSufijoCuota } from '../lib/cuotasGroupHelper';
import TarjetasCuotasCard from '../components/dashboard/TarjetasCuotasCard';
import MetricCard from '../components/reportes/MetricCard';
import BarraCategoria from '../components/reportes/BarraCategoria';
import ResumenChip from '../components/reportes/ResumenChip';
import GraficoBarras from '../components/reportes/GraficoBarras';
import GraficoDona from '../components/reportes/GraficoDona';
import TablaMovimientos from '../components/reportes/TablaMovimientos';
import { COLORES } from '../components/reportes/colores';

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
