// Barrel: re-exporta el router combinado de ./grupos/index.js.
// Mantenido como punto de entrada fino (Refactor R2 — mejoras.md) para que
// server/index.js no requiera ningún cambio de import.
module.exports = require('./grupos/index');
