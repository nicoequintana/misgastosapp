import React from 'react';
import GlassCard from '../GlassCard';
import { formatCurrency } from '../../utils/format';

/**
 * Tarjeta de resumen financiero.
 * Muestra un ícono, etiqueta y monto formateado.
 * 
 * @param {Object} props
 * @param {string} props.title - Título de la métrica
 * @param {number} props.amount - Monto a mostrar (puede ser negativo)
 * @param {string} props.icon - Nombre del ícono de Material Symbols
 * @param {string} props.color - Nombre de la variable de color CSS (ej: 'success')
 */
const SummaryCard = ({ title, amount, icon, color }) => (
    <GlassCard className="summary-card">
        <div className="summary-icon" style={{
            backgroundColor: `var(--${color}-light)`,
            color: `var(--${color})`
        }}>
            <span className="material-symbols-outlined">{icon}</span>
        </div>
        <p className="summary-label">{title}</p>
        <h3 className="summary-amount">
            ${formatCurrency(amount)}
        </h3>
    </GlassCard>
);

export default SummaryCard;
