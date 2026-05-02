import React from 'react';
import GlassCard from '../GlassCard';
import { formatCurrency } from '../../utils/format';

const EMPTY_ICONS = {
    'Gastos Recientes': 'receipt_long',
    'Gastos Fijos': 'lock',
};

/**
 * Tabla de gastos de solo lectura para el Dashboard.
 * Muestra descripción, categoría y monto. Estado vacío con ícono contextual.
 */
const DashboardTable = ({ title, expenses }) => (
    <GlassCard className="expense-table-card">
        <div className="table-header-box">
            <h3 className="table-title">{title}</h3>
            <span className="category-tag counter">{expenses.length} registros</span>
        </div>

        {expenses.length === 0 ? (
            <div className="dashboard-table-empty">
                <span className="material-symbols-outlined dashboard-table-empty-icon">
                    {EMPTY_ICONS[title] || 'inbox'}
                </span>
                <p>Sin registros todavía</p>
            </div>
        ) : (
            <div className="table-responsive">
                <table className="expense-table">
                    <thead>
                        <tr>
                            <th className="text-left">Descripción</th>
                            <th className="text-center">Categoría</th>
                            <th className="text-right">Monto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {expenses.map((gasto) => (
                            <tr key={gasto.id} className="expense-row">
                                <td className="cell-desc">
                                    <span style={{ fontWeight: 600 }}>{gasto.descripcion}</span>
                                </td>
                                <td className="text-center">
                                    <span className="category-tag" style={{
                                        color: 'var(--primary)',
                                        display: 'inline-block'
                                    }}>
                                        {gasto.categorias?.nombre || 'General'}
                                    </span>
                                </td>
                                <td className="cell-amount amount-expense text-right">
                                    <span className="responsive-amount">
                                        -${formatCurrency(gasto.monto)}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </GlassCard>
);

export default DashboardTable;
