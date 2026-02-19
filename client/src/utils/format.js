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
