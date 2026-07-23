import { useEffect } from 'react';

// En formularios largos de las pantallas de auth (registro, recuperación de
// clave) el contenido puede superar 100dvh — el body scrollea de más y, sin
// esto, se ve el fondo claro global de la app por debajo del contenido
// oscuro de wlc-root. Aplica el mismo fondo oscuro al body mientras la
// pantalla está montada, y lo revierte al desmontar.
export const useFondoOscuroAuth = () => {
    useEffect(() => {
        const fondoPrevio = document.body.style.background;
        document.body.style.background = '#060d1a';
        return () => {
            document.body.style.background = fondoPrevio;
        };
    }, []);
};
