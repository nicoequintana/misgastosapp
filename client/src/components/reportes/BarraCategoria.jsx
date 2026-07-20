import { formatCurrency } from '../../utils/format';

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

export default BarraCategoria;
