import React from 'react';

/**
 * Componente contenedor con efecto de "vidrio esmerilado" (glassmorphism).
 * @param {React.ReactNode} children - Contenido interno de la tarjeta.
 * @param {string} className - Clases CSS adicionales.
 */
const GlassCard = ({ children, className = "" }) => {
    return (
        <div className={`glass-card ${className}`}>
            {children}
        </div>
    );
};

export default GlassCard;
