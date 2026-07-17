import React, { useState } from 'react';

/**
 * Selector de opciones en formato chip (ícono + nombre), con progressive disclosure:
 * muestra las primeras `limiteVisible` opciones y un chip "Ver más" para desplegar el resto.
 *
 * @param {Array<{id: string|number, nombre: string, icono: string}>} opciones
 * @param {string|number|null} valorSeleccionado - id de la opción activa
 * @param {(id: string|number) => void} onChange
 * @param {number} [limiteVisible=6]
 */
const ChipSelector = ({ opciones, valorSeleccionado, onChange, limiteVisible = 6 }) => {
    const [expandido, setExpandido] = useState(false);

    const hayMas = opciones.length > limiteVisible;
    const visibles = expandido || !hayMas ? opciones : opciones.slice(0, limiteVisible);

    return (
        <div className="chip-selector">
            {visibles.map(op => (
                <button
                    key={op.id}
                    type="button"
                    className={`chip-selector__chip${valorSeleccionado === op.id ? ' chip-selector__chip--activo' : ''}`}
                    onClick={() => onChange(op.id)}
                >
                    <span className="material-symbols-outlined chip-selector__icono">{op.icono}</span>
                    <span>{op.nombre}</span>
                </button>
            ))}
            {hayMas && !expandido && (
                <button
                    type="button"
                    className="chip-selector__chip chip-selector__chip--ver-mas"
                    onClick={() => setExpandido(true)}
                >
                    <span className="material-symbols-outlined chip-selector__icono">expand_more</span>
                    <span>Ver más</span>
                </button>
            )}
        </div>
    );
};

export default ChipSelector;
