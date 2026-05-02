import React from 'react';
import GlassCard from '../GlassCard';
import { formatCurrency } from '../../utils/format';

/**
 * Tabla de gastos de solo lectura para el Dashboard.
 * Muestra descripción, categoría y monto alineados correctamente.
 * 
 * @param {Object} props
 * @param {string} props.title - Título de la tabla
 * @param {Array} props.expenses - Lista de gastos a mostrar
 */
const DashboardTable = ({ title, expenses }) => (
    <GlassCard className="expense-table-card">
        <div className="table-header-box">
            <h3 className="table-title">{title}</h3>
            <span className="category-tag counter">{expenses.length} registros</span>
        </div>
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
                    {expenses.length > 0 ? (
                        expenses.map((gasto) => (
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
                        ))
                    ) : (
                        <tr>
                            <td colSpan="3" className="empty-state">
                                No hay datos registrados aún.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </GlassCard>
);

export default DashboardTable;
