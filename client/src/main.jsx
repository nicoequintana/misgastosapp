import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Fuentes self-hosted (empaquetadas en el build, sin depender de fonts.googleapis.com/gstatic.com
// en runtime). Evita que el Service Worker cachee una respuesta de fuente rota de forma permanente.
import '@fontsource/manrope/300.css'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
import 'material-symbols/outlined.css'

import './index.css'

/**
 * Punto de entrada principal de la aplicación React.
 * Inicializa el DOM de React y renderiza el componente App dentro del elemento 'root'.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
