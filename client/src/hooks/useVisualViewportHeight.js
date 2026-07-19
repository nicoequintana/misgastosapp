import { useState, useEffect } from 'react';

/**
 * Altura real del viewport visual, en píxeles. A diferencia de 100dvh, se achica
 * cuando aparece el teclado virtual en mobile (Visual Viewport API) — sin esto,
 * un modal fijo abajo queda tapado por el teclado al enfocar un input.
 * Devuelve null en navegadores sin soporte (fallback: no limitar altura).
 */
export const useVisualViewportHeight = () => {
    const [height, setHeight] = useState(() => window.visualViewport?.height ?? null);

    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;

        const actualizar = () => setHeight(viewport.height);
        viewport.addEventListener('resize', actualizar);
        viewport.addEventListener('scroll', actualizar);
        return () => {
            viewport.removeEventListener('resize', actualizar);
            viewport.removeEventListener('scroll', actualizar);
        };
    }, []);

    return height;
};
