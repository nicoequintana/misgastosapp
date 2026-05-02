const crypto = require('crypto');

/**
 * Normaliza montos (acepta coma o punto)
 * 
 * @param {string|number} val - Monto a normalizar
 * @returns {number} Monto normalizado o NaN
 */
const normalizeAmount = (val) => {
    if (typeof val === 'number') return val;
    if (typeof val !== 'string') return NaN;
    const clean = val.replace(/\s/g, '').replace(',', '.');
    return parseFloat(clean);
};

/**
 * Genera huella digital para evitar duplicados exactos el mismo día.
 * 
 * @param {Object} data - Datos del gasto
 * @returns {string} MD5 hash de los datos
 */
const generateFingerprint = (data) => {
    const { descripcion, monto, categoria, medioPago, fecha } = data;
    const raw = `${descripcion.trim().toLowerCase()}|${Number(monto).toFixed(2)}|${categoria.trim().toLowerCase()}|${medioPago.trim().toLowerCase()}|${fecha}`;
    return crypto.createHash('md5').update(raw).digest('hex');
};

module.exports = {
    normalizeAmount,
    generateFingerprint
};
