import React from 'react';
import MiembroChip from './MiembroChip';

/**
 * Selector múltiple de miembros activos de un grupo.
 * Muestra una lista de checkboxes, uno por miembro activo,
 * cada uno acompañado de su MiembroChip para fácil identificación visual.
 *
 * @param {Object}   props
 * @param {Array}    props.miembros       - Lista de miembros: [{user_id, alias, rol, estado}]
 * @param {Array}    props.seleccionados  - Array de user_id actualmente seleccionados
 * @param {Function} props.onChange       - Callback que recibe el nuevo array de user_ids seleccionados
 */
const MiembrosSelector = ({ miembros = [], seleccionados = [], onChange }) => {
    // Solo mostramos miembros con estado activo
    const miembrosActivos = miembros.filter((m) => m.estado === 'activo');

    // Maneja el toggle individual de un miembro
    const handleToggle = (userId) => {
        const estaSeleccionado = seleccionados.includes(userId);
        if (estaSeleccionado) {
            // Quitar de la lista — sin mutar el array original
            onChange(seleccionados.filter((id) => id !== userId));
        } else {
            // Agregar a la lista
            onChange([...seleccionados, userId]);
        }
    };

    if (miembrosActivos.length === 0) {
        return (
            <p className="miembros-selector__empty">
                No hay miembros activos en este grupo.
            </p>
        );
    }

    return (
        <div className="miembros-selector">
            {miembrosActivos.map((miembro) => {
                const seleccionado = seleccionados.includes(miembro.user_id);
                return (
                    <label
                        key={miembro.user_id}
                        className={`miembros-selector__item ${seleccionado ? 'miembros-selector__item--seleccionado' : ''}`}
                    >
                        {/* Checkbox nativo oculto visualmente, accesible por teclado */}
                        <input
                            type="checkbox"
                            className="miembros-selector__checkbox"
                            checked={seleccionado}
                            onChange={() => handleToggle(miembro.user_id)}
                        />
                        {/* Indicador visual del checkbox */}
                        <span className="miembros-selector__check-icon">
                            {seleccionado
                                ? <span className="material-symbols-outlined">check_box</span>
                                : <span className="material-symbols-outlined">check_box_outline_blank</span>
                            }
                        </span>
                        {/* Chip con avatar y nombre del miembro */}
                        <MiembroChip miembro={miembro} />
                    </label>
                );
            })}
        </div>
    );
};

export default MiembrosSelector;
