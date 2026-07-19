import React from 'react';
import { formatCurrency } from '../../utils/format';

/**
 * Fila de dato financiero dentro del summary-panel.
 * La prop `dominant` aplica jerarquía visual destacada (Saldo Disponible).
 * La prop `hidden` oculta el importe mostrando puntos en su lugar.
 * La prop `onClick`, si se pasa, vuelve la fila interactiva (abre el wizard de carga correspondiente).
 */
const SummaryCard = ({ title, amount, icon, color, dominant = false, subtitle, hidden = false, onClick }) => (
    <div
        className={`summary-row${dominant ? ' summary-row--dominant' : ''}${onClick ? ' summary-row--clickable' : ''}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
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
            {hidden ? '••••••' : `$${formatCurrency(amount)}`}
        </span>
    </div>
);

export default React.memo(SummaryCard);
