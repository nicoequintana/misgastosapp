import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

/**
 * Loader de primer nivel que cubre toda la pantalla mientras la app inicializa.
 * Se monta sobre todo el contenido y se desvanece con animación cuando loading === false.
 * Evita el flash de contenido (FOUC) durante la resolución de auth y temas.
 *
 * @param {boolean} loading - true mientras la app está inicializando
 * @param {React.ReactNode} children - contenido de la app
 */
const AppLoader = ({ loading, children }) => {
    // visible controla si el overlay está en el DOM
    // exiting controla la animación de salida
    const [visible, setVisible]  = useState(true);
    const [exiting, setExiting]  = useState(false);

    useEffect(() => {
        if (!loading) {
            // Diferimos el setState para evitar cascada de renders dentro del efecto
            const exitTimer   = setTimeout(() => setExiting(true), 0);
            const removeTimer = setTimeout(() => setVisible(false), 600);
            return () => {
                clearTimeout(exitTimer);
                clearTimeout(removeTimer);
            };
        }
    }, [loading]);

    const overlay = visible
        ? ReactDOM.createPortal(
            <div className={`app-loader-overlay${exiting ? ' app-loader-overlay--exit' : ''}`}>
                <div className="app-loader-card">
                    <div className="app-loader-logo">
                        <span className="material-symbols-outlined app-loader-icon">account_balance_wallet</span>
                    </div>
                    <p className="app-loader-brand">Tus Gastos</p>
                    <div className="app-loader-bar">
                        <div className="app-loader-bar-fill" />
                    </div>
                </div>
            </div>,
            document.body
        )
        : null;

    return (
        <>
            {overlay}
            {children}
        </>
    );
};

export default AppLoader;
