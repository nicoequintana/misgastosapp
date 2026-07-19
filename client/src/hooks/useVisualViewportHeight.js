import { useState, useEffect } from 'react';

/**
 * Alto y offset real del viewport visual (Visual Viewport API). A diferencia de
 * 100dvh, se achica cuando aparece el teclado virtual en mobile — sin esto, un
 * modal fijo abajo queda tapado por el teclado al enfocar un input.
 * offsetTop es necesario porque en iOS/Chrome mobile el layout viewport (donde
 * vive un position:fixed) no se mueve al abrir el teclado, pero el viewport
 * visual sí se desplaza hacia abajo — sin sumarlo, el overlay queda desalineado
 * respecto a lo que el usuario realmente ve y el modal se corta por arriba.
 * Devuelve { height: null, offsetTop: 0 } en navegadores sin soporte (fallback: no limitar altura).
 */
export const useVisualViewportHeight = () => {
    const [viewport, setViewport] = useState(() => ({
        height: window.visualViewport?.height ?? null,
        offsetTop: window.visualViewport?.offsetTop ?? 0,
    }));

    useEffect(() => {
        const visualViewport = window.visualViewport;
        if (!visualViewport) return;

        const actualizar = () => setViewport({
            height: visualViewport.height,
            offsetTop: visualViewport.offsetTop,
        });
        visualViewport.addEventListener('resize', actualizar);
        visualViewport.addEventListener('scroll', actualizar);
        return () => {
            visualViewport.removeEventListener('resize', actualizar);
            visualViewport.removeEventListener('scroll', actualizar);
        };
    }, []);

    return viewport;
};
