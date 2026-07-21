// ─────────────────────────────────────────────
// Router principal de /api/grupos — combina los sub-routers por dominio.
// Refactor R2 (mejoras.md): server/routes/grupos.js (1464 líneas, 13 endpoints
// mezclando invitaciones/gastos/liquidaciones/miembros) partido en módulos por
// dominio. Movimiento mecánico puro — mismos paths, mismos métodos HTTP,
// mismo comportamiento observable.
// ─────────────────────────────────────────────
const express = require('express');

const router = express.Router();

router.use(require('./invitaciones'));
router.use(require('./grupo'));
router.use(require('./gastos'));
router.use(require('./liquidaciones'));

module.exports = router;
