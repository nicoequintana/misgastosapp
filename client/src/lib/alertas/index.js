// Barrel de los motores de alerta — funciones puras de decisión (input stats/config -> notificaciones).
// El efecto secundario (persistir en Supabase vía agregarNotificacion) vive en NotificacionesContext.jsx.
export { evaluarAlertasFinancieras } from './alertasFinancieras';
export { evaluarAlertaGastoAlto } from './alertaGastoAlto';
export { evaluarAlertasGastosFijos } from './alertasGastosFijos';
export { evaluarAlertaConcentracionCategoria } from './alertaConcentracionCategoria';
export { calcularProyecciones } from './proyecciones';
export { generarResumenDiario } from './resumenDiario';
export { generarResumenSemanal } from './resumenSemanal';
export { generarResumenMensual } from './resumenMensual';
