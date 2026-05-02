import React from 'react';
import GlassCard from '../GlassCard';
import { formatCurrency } from '../../utils/format';

/**
 * Tarjeta de resumen financiero.
 * La prop `dominant` aplica jerarquía visual destacada (para Saldo Disponible).
 * La prop `subtitle` muestra una línea de contexto debajo del monto.
 */
const SummaryCard = ({ title, amount, icon, color, dominant = false, subtitle }) => (
    <GlassCard className={`summary-card${dominant ? ' summary-card--dominant' : ''}`}>
        <div className="summary-card-top">
            <div className="summary-icon" style={{
                backgroundColor: `var(--${color}-light)`,
                color: `var(--${color})`
            }}>
                <span className="material-symbols-outlined">{icon}</span>
            </div>
            {dominant && (
                <span className="summary-card-badge">Principal</span>
            )}
        </div>
        <p className="summary-label">{title}</p>
        <h3 className="summary-amount" style={{ color: dominant ? `var(--${color})` : undefined }}>
            ${formatCurrency(amount)}
        </h3>
        {subtitle && (
            <p className="summary-subtitle">{subtitle}</p>
        )}
    </GlassCard>
);

export default SummaryCard;
