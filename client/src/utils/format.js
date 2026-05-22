/**
 * Devuelve la fecha actual en Argentina (UTC-3) como string YYYY-MM-DD.
 * Evita el bug de toISOString() que usa UTC y entre las 21:00 y 00:00
 * devolvería la fecha del día siguiente.
 * @returns {string} Fecha en formato YYYY-MM-DD (hora Argentina).
 */
export const fechaHoyArgentina = () => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
};

/**
 * Formatea un valor numérico como moneda argentina (ARS).
 * @param {number|string} value - El valor a formatear.
 * @returns {string} El valor formateado o un string vacío.
 */
export const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '';
    return Number(value).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

/**
 * Calcula el año, mes y nombre del mes siguiente al actual.
 * Maneja el salto de diciembre a enero.
 * @returns {{ anio: number, mes: number, nombre: string }}
 */
export const calcularMesSiguiente = () => {
    const hoy  = new Date();
    const mes  = hoy.getMonth() === 11 ? 1 : hoy.getMonth() + 2;
    const anio = hoy.getMonth() === 11 ? hoy.getFullYear() + 1 : hoy.getFullYear();
    const nombre = new Date(anio, mes - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return { anio, mes, nombre };
};

/**
 * Formatea una fecha de manera robusta para Argentina.
 * Usa la zona horaria local para evitar el desfase UTC.
 * @param {string} dateStr - Fecha en formato ISO o YYYY-MM-DD
 * @returns {string} Fecha formateada dd/mm/aaaa, o 'N/A' / 'Fecha inválida'
 */
export const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
        const fechaStr = String(dateStr).split('T')[0];
        const date = new Date(`${fechaStr}T12:00:00Z`);
        if (isNaN(date.getTime())) return 'Fecha inválida';
        return date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'America/Argentina/Buenos_Aires',
        });
    } catch {
        return 'Error fecha';
    }
};

/**
 * Convierte un string con formato de moneda a un número decimal simple.
 * @param {string} value - El string de moneda (ej: "1.234,56").
 * @returns {number} El valor numérico.
 */
export const parseCurrency = (value) => {
    if (!value) return 0;
    // Elimina los puntos (separador de miles) y reemplaza la coma por punto (separador decimal)
    const cleanValue = value.replace(/\./g, '').replace(',', '.');
    return parseFloat(cleanValue);
};
