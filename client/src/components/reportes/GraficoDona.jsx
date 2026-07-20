import { formatCurrency } from '../../utils/format';
import { COLORES } from './colores';

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

export default GraficoDona;
