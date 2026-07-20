import { formatCurrency } from '../../utils/format';

const MovimientoCard = ({ gasto }) => {
    // Agregamos T12:00:00 para evitar que la fecha cambie de día por desfase UTC en Argentina (UTC-3).
    const fechaStr = gasto.fecha || '';
    const fechaDate = fechaStr.includes('T') ? new Date(fechaStr) : new Date(`${fechaStr}T12:00:00`);
    const fecha = fechaDate.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });

    return (
        <article className="reporte-movimiento-card">
            <div className="reporte-movimiento-top">
                <div>
                    <p className="reporte-movimiento-fecha">{fecha}</p>
                    <h4 className="reporte-movimiento-desc">{gasto.descripcion}</h4>
                </div>
                <strong className="reporte-movimiento-monto">${formatCurrency(parseFloat(gasto.monto))}</strong>
            </div>

            <div className="reporte-movimiento-tags">
                <span className="reporte-tag">{gasto.categorias?.nombre || '—'}</span>
                <span className="reporte-tag reporte-tag--soft">{gasto.metodos_pago?.nombre || '—'}</span>
                <span className={`reporte-tipo-badge ${gasto.es_fijo ? 'reporte-tipo-badge--fijo' : 'reporte-tipo-badge--variable'}`}>
                    {gasto.es_fijo ? 'Fijo' : 'Variable'}
                </span>
            </div>
        </article>
    );
};

export default MovimientoCard;
