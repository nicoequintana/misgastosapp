import GlassCard from '../GlassCard';
import { formatCurrency } from '../../utils/format';

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

export default MetricCard;
