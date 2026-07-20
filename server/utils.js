const crypto = require('crypto');

/**
 * Normaliza montos (acepta coma o punto)
 * 
 * @param {string|number} val - Monto a normalizar
 * @returns {number} Monto normalizado o NaN
 */
const normalizeAmount = (val) => {
    if (typeof val === 'number') {
        return isFinite(val) ? val : NaN;
    }
    if (typeof val !== 'string') return NaN;
    // Eliminar espacios y puntos usados como separadores de miles (formato AR: 1.500,50).
    // Luego reemplazar la coma decimal por punto para parseFloat.
    const clean = val.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isFinite(parsed) ? parsed : NaN;
};

/**
 * Genera huella digital para evitar duplicados exactos el mismo día.
 * Usa SHA-256 en lugar de MD5 para mayor seguridad criptográfica.
 * 
 * @param {Object} data - Datos del gasto
 * @returns {string} SHA-256 hash de los datos
 */
const generateFingerprint = (data) => {
    const { descripcion, monto, categoria, medioPago, fecha, user_id } = data;
    const raw = `${user_id}|${descripcion.trim().toLowerCase()}|${Number(monto).toFixed(2)}|${categoria.trim().toLowerCase()}|${medioPago.trim().toLowerCase()}|${fecha}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
};

/**
 * Compara dos API keys en tiempo constante para evitar timing attacks.
 * `apiKey !== expectedKey` con strings normales compara byte a byte y aborta
 * en el primer mismatch, filtrando por timing cuántos bytes iniciales coinciden
 * (permite fuerza bruta progresiva). crypto.timingSafeEqual siempre compara
 * los buffers completos sin importar dónde difieren.
 *
 * @param {string} apiKey - Valor recibido del header x-api-key
 * @param {string} expectedKey - Valor esperado (desde env)
 * @returns {boolean} true si coinciden exactamente
 */
const compararApiKey = (apiKey, expectedKey) => {
    if (typeof apiKey !== 'string' || typeof expectedKey !== 'string') return false;

    const bufApiKey = Buffer.from(apiKey, 'utf8');
    const bufExpected = Buffer.from(expectedKey, 'utf8');

    // timingSafeEqual exige buffers de igual longitud — si difieren, ya sabemos
    // que no matchean, pero igual comparamos contra un buffer dummy del mismo
    // tamaño que apiKey para no filtrar la longitud de expectedKey por early-return.
    if (bufApiKey.length !== bufExpected.length) {
        crypto.timingSafeEqual(bufApiKey, bufApiKey);
        return false;
    }

    return crypto.timingSafeEqual(bufApiKey, bufExpected);
};

module.exports = {
    normalizeAmount,
    generateFingerprint,
    compararApiKey
};
