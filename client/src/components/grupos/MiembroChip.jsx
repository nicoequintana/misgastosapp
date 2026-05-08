import React from 'react';

/**
 * Chip compacto para mostrar un miembro de un grupo.
 * Muestra la inicial del alias/nombre, evitando exponer el user_id en UI.
 * el alias y un badge "admin" si corresponde.
 *
 * @param {Object} props
 * @param {Object} props.miembro - Datos del miembro: { user_id, alias, rol, estado }
 */
const MiembroChip = ({ miembro }) => {
    // Calcula las iniciales: alias/nombre tiene prioridad, sino usa placeholder neutral.
    const obtenerIniciales = () => {
        const etiqueta = miembro.alias || miembro.nombre || '';
        if (etiqueta && etiqueta.trim()) {
            const palabras = etiqueta.trim().split(/\s+/);
            if (palabras.length >= 2) {
                // Dos palabras: primera letra de cada una
                return (palabras[0][0] + palabras[1][0]).toUpperCase();
            }
            // Una sola palabra: primera letra
            return etiqueta.trim()[0].toUpperCase();
        }
        return 'SN';
    };

    const esAdmin = miembro.rol === 'admin';
    const nombre = miembro.alias || miembro.nombre || 'Usuario sin nombre';

    return (
        <div className={`miembro-chip ${esAdmin ? 'miembro-chip--admin' : ''}`} title={nombre}>
            {/* Avatar con iniciales */}
            <div className="miembro-chip__avatar">
                {obtenerIniciales()}
            </div>

            {/* Nombre / alias */}
            <span className="miembro-chip__nombre">{nombre}</span>

            {/* Badge admin */}
            {esAdmin && (
                <span className="miembro-chip__badge">admin</span>
            )}
        </div>
    );
};

export default MiembroChip;
