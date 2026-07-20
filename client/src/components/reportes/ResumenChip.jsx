const ResumenChip = ({ label, value, tone = 'neutral' }) => (
    <div className={`reportes-chip reportes-chip--${tone}`}>
        <span className="reportes-chip-label">{label}</span>
        <span className="reportes-chip-value">{value}</span>
    </div>
);

export default ResumenChip;
