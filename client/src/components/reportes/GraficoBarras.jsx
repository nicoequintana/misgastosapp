import { useMemo } from 'react';
import { formatCurrency } from '../../utils/format';
import { COLORES } from './colores';

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

export default GraficoBarras;
