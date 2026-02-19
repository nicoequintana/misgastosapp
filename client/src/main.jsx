import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
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
