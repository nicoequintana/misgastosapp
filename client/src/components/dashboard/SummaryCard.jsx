import React from 'react';
import { formatCurrency } from '../../utils/format';

/**
 * Fila de dato financiero dentro del summary-panel.
 * La prop `dominant` aplica jerarquía visual destacada (Saldo Disponible).
 */
const SummaryCard = ({ title, amount, icon, color, dominant = false, subtitle }) => (
    <div className={`summary-row${dominant ? ' summary-row--dominant' : ''}`}>
        <div className="summary-row-icon" style={{
            backgroundColor: `var(--${color}-light)`,
            color: `var(--${color})`
        }}>
            <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div className="summary-row-label">
            <span className="summary-row-title">{title}</span>
            {subtitle && <span className="summary-row-subtitle">{subtitle}</span>}
        </div>
        <span className="summary-row-amount" style={{ color: dominant ? `var(--${color})` : undefined }}>
            ${formatCurrency(amount)}
        </span>
    </div>
);

export default SummaryCard;
