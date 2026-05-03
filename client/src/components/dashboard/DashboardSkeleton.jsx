import React from 'react';
import GlassCard from '../GlassCard';

/**
 * Skeleton del Dashboard.
 * Replica exactamente la estructura visual del dashboard real
 * para evitar el salto de layout al cargar los datos.
 * Cada bloque tiene la misma altura y posición que su contraparte real.
 */

const Bone = ({ w = '100%', h = '14px', radius = '6px', style = {} }) => (
    <div className="sk-bone" style={{ width: w, height: h, borderRadius: radius, ...style }} />
);

const SummaryCardSkeleton = ({ dominant = false }) => (
    <GlassCard className={`summary-card${dominant ? ' summary-card--dominant' : ''}`}>
        <div className="summary-card-top">
            <Bone w="40px" h="40px" radius="12px" />
        </div>
        <Bone w="60%" h="12px" style={{ marginTop: '12px' }} />
        <Bone w="75%" h="28px" radius="8px" style={{ marginTop: '8px' }} />
        <Bone w="50%" h="11px" style={{ marginTop: '8px' }} />
    </GlassCard>
);

const TableRowSkeleton = () => (
    <tr className="sk-table-row">
        <td><Bone w="70px" h="12px" /></td>
        <td><Bone w="130px" h="12px" /></td>
        <td><Bone w="80px" h="20px" radius="20px" /></td>
        <td><Bone w="70px" h="20px" radius="20px" /></td>
        <td><Bone w="60px" h="12px" /></td>
        <td><Bone w="50px" h="20px" radius="20px" /></td>
    </tr>
);

const TableSkeleton = ({ rows = 4 }) => (
    <GlassCard style={{ height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <Bone w="140px" h="16px" radius="6px" />
            <Bone w="60px" h="12px" radius="6px" />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
                {Array.from({ length: rows }).map((_, i) => (
                    <TableRowSkeleton key={i} />
                ))}
            </tbody>
        </table>
    </GlassCard>
);

const DashboardSkeleton = () => (
    <div className="dashboard-container sk-container">

        {/* Header */}
        <div className="dashboard-header">
            <div className="dashboard-title">
                <Bone w="160px" h="28px" radius="8px" />
                <Bone w="240px" h="14px" radius="6px" style={{ marginTop: '8px' }} />
            </div>
            <div className="dashboard-actions">
                <Bone w="110px" h="38px" radius="10px" />
                <Bone w="130px" h="38px" radius="10px" />
            </div>
        </div>

        {/* Summary cards */}
        <div className="summary-grid">
            <SummaryCardSkeleton />
            <SummaryCardSkeleton dominant />
            <SummaryCardSkeleton />
            <SummaryCardSkeleton />
        </div>

        {/* Tables */}
        <div className="tables-grid">
            <div style={{ height: '100%' }}>
                <TableSkeleton title="Gastos Recientes" rows={5} />
            </div>
            <div style={{ height: '100%' }}>
                <TableSkeleton title="Gastos Fijos" rows={4} />
            </div>
        </div>

        {/* Footer button */}
        <div className="dashboard-footer">
            <Bone w="200px" h="38px" radius="10px" />
        </div>
    </div>
);

export default DashboardSkeleton;
