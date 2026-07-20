import { useState } from 'react';
import { formatCurrency } from '../../utils/format';
import MovimientoCard from './MovimientoCard';

const POR_PAGINA = 15;

/**
 * Tabla detallada de movimientos del período.
 */
const TablaMovimientos = ({ gastos }) => {
    const [pagina, setPagina] = useState(0);
    const total = gastos.length;
    const totalPaginas = Math.ceil(total / POR_PAGINA);

    // Clampear la página actual sin useEffect para evitar renders en cascada
    const paginaActual = Math.min(pagina, Math.max(0, totalPaginas - 1));
    const slice = gastos.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA);

    if (total === 0) {
        return (
            <div className="reporte-tabla-empty">
                <span className="material-symbols-outlined">receipt_long</span>
                <p>No hay movimientos en el período seleccionado.</p>
            </div>
        );
    }

    return (
        <div className="reporte-tabla-wrap">
            <div className="reportes-movimientos-cards">
                {slice.map(g => (
                    <MovimientoCard key={g.id} gasto={g} />
                ))}
            </div>

            <div className="reporte-tabla-scroll">
                <table className="reporte-tabla">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Descripción</th>
                            <th>Categoría</th>
                            <th>Método</th>
                            <th>Tipo</th>
                            <th className="reporte-tabla-monto">Monto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slice.map(g => (
                            <tr key={g.id}>
                                <td className="reporte-tabla-fecha">
                                    {new Date(g.fecha?.includes('T') ? g.fecha : `${g.fecha}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                </td>
                                <td className="reporte-tabla-desc">{g.descripcion}</td>
                                <td>
                                    <span className="reporte-tag">{g.categorias?.nombre || '—'}</span>
                                </td>
                                <td className="reporte-tabla-metodo">{g.metodos_pago?.nombre || '—'}</td>
                                <td>
                                    <span className={`reporte-tipo-badge ${g.es_fijo ? 'reporte-tipo-badge--fijo' : 'reporte-tipo-badge--variable'}`}>
                                        {g.es_fijo ? 'Fijo' : 'Variable'}
                                    </span>
                                </td>
                                <td className="reporte-tabla-monto reporte-tabla-monto--val">
                                    ${formatCurrency(parseFloat(g.monto))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPaginas > 1 && (
                <div className="reporte-tabla-paginacion">
                    <button
                        className="btn btn-secondary reporte-pag-btn"
                        disabled={paginaActual === 0}
                        onClick={() => setPagina(p => Math.max(0, p - 1))}
                    >
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <span className="reporte-pag-info">
                        {paginaActual + 1} / {totalPaginas} — {total} movimientos
                    </span>
                    <button
                        className="btn btn-secondary reporte-pag-btn"
                        disabled={paginaActual >= totalPaginas - 1}
                        onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                    >
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default TablaMovimientos;
