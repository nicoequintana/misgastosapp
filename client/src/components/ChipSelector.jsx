import React, { useState } from 'react';

// Paleta fija de colores de borde por posición — da identidad visual a cada chip
// sin depender de un campo de color en la base de datos. Se repite en ciclo si
// hay más opciones que colores.
const PALETA_COLORES = [
    '#f97583', '#4fd1c5', '#f6c344', '#a78bfa',
    '#63b3ed', '#f6ad55', '#68d391', '#fc8181',
    '#b794f4', '#76e4f7',
];

/**
 * Selector de opciones en formato chip (ícono + nombre), con progressive disclosure:
 * muestra las primeras `limiteVisible` opciones y un chip "Ver más"/"Ver menos" para
 * desplegar o colapsar el resto. Cada chip toma un color de borde distinto según su
 * posición en la lista, tomado de una paleta fija.
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
            {visibles.map((op, i) => (
                <button
                    key={op.id}
                    type="button"
                    className={`chip-selector__chip${valorSeleccionado === op.id ? ' chip-selector__chip--activo' : ''}`}
                    style={{ '--chip-color': PALETA_COLORES[i % PALETA_COLORES.length] }}
                    onClick={() => onChange(op.id)}
                >
                    <span className="material-symbols-outlined chip-selector__icono">{op.icono}</span>
                    <span>{op.nombre}</span>
                </button>
            ))}
            {hayMas && (
                <button
                    type="button"
                    className="chip-selector__chip chip-selector__chip--ver-mas"
                    onClick={() => setExpandido(prev => !prev)}
                >
                    <span className="material-symbols-outlined chip-selector__icono">
                        {expandido ? 'expand_less' : 'expand_more'}
                    </span>
                    <span>{expandido ? 'Ver menos' : 'Ver más'}</span>
                </button>
            )}
        </div>
    );
};

export default ChipSelector;
