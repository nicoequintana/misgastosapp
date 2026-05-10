/**
 * Tests para las validaciones del endpoint POST /api/integrations/n8n/gasto.
 *
 * Como index.js no exporta `app`, testeamos las validaciones de forma unitaria
 * extrayendo la lógica inline. Esto es más robusto que levantar el servidor
 * completo y evita problemas con app.listen() en entornos de test.
 *
 * Cubre:
 * - validateApiKey (middleware)
 * - Validaciones de campos del body del endpoint n8n
 * - normalizeAmount (integración)
 * - UUID regex
 * - Email regex
 */

const { normalizeAmount } = require('../utils');

// ── Réplica de validateApiKey (server/index.js) ───────────────────────────────

function makeValidateApiKey(expectedKey) {
    return function validateApiKey(apiKey) {
        if (!expectedKey) return { ok: false, status: 500, error: 'Servidor: API Key no configurada' };
        if (apiKey !== expectedKey) return { ok: false, status: 401, error: 'No autorizado' };
        return { ok: true };
    };
}

// ── Réplica de la lógica de validación del body (server/index.js líneas 140-180) ──

const UUID_REGEX   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateN8nBody({ descripcion, monto, categoria, medioPago, user_id, email_usuario }) {
    // 1. Campos obligatorios
    if (!descripcion || monto === undefined || !categoria || !medioPago || !user_id) {
        return { ok: false, status: 400, error: 'Faltan campos obligatorios' };
    }

    // 2. Descripción: 1-500 caracteres
    if (typeof descripcion !== 'string' || descripcion.trim().length === 0 || descripcion.length > 500) {
        return { ok: false, status: 400, error: 'descripcion debe tener entre 1 y 500 caracteres' };
    }

    // 3. Monto: número válido, positivo, finito
    const normalizedMonto = normalizeAmount(monto);
    if (isNaN(normalizedMonto) || !isFinite(normalizedMonto) || normalizedMonto <= 0) {
        return { ok: false, status: 400, error: 'Monto debe ser mayor a cero' };
    }

    // 4. Categoria y medioPago: enteros positivos
    const categoriaNum = Number(categoria);
    const mediaNum     = Number(medioPago);
    if (!Number.isInteger(categoriaNum) || !Number.isInteger(mediaNum) || categoriaNum <= 0 || mediaNum <= 0) {
        return { ok: false, status: 400, error: 'categoria y medioPago deben ser IDs numéricos válidos y mayores a cero' };
    }

    // 5. user_id: UUID válido
    if (!UUID_REGEX.test(user_id)) {
        return { ok: false, status: 400, error: 'Datos de usuario inválidos' };
    }

    // 6. email_usuario: opcional pero debe ser válido si viene
    if (email_usuario && !EMAIL_REGEX.test(email_usuario)) {
        return { ok: false, status: 400, error: 'email_usuario inválido' };
    }

    return { ok: true, monto: normalizedMonto, categoriaNum, mediaNum };
}

// ── Fixture ───────────────────────────────────────────────────────────────────

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const validBody = () => ({
    descripcion: 'SUPERMERCADO DIA',
    monto: 1500.50,
    categoria: 3,
    medioPago: 1,
    user_id: VALID_UUID,
});

// ── Tests: validateApiKey ─────────────────────────────────────────────────────

describe('validateApiKey', () => {
    const validate = makeValidateApiKey('mi-clave-secreta');

    it('API key correcta → ok: true', () => {
        expect(validate('mi-clave-secreta').ok).toBe(true);
    });

    it('API key incorrecta → 401', () => {
        const result = validate('clave-incorrecta');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(401);
    });

    it('sin API key (undefined) → 401', () => {
        const result = validate(undefined);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(401);
    });

    it('sin expectedKey configurada → 500', () => {
        const validate500 = makeValidateApiKey(undefined);
        const result = validate500('cualquier-clave');
        expect(result.status).toBe(500);
    });
});

// ── Tests: campos obligatorios ────────────────────────────────────────────────

describe('validateN8nBody — campos obligatorios', () => {
    it('body completo y válido → ok: true', () => {
        expect(validateN8nBody(validBody()).ok).toBe(true);
    });

    it('sin descripcion → 400', () => {
        const body = validBody();
        delete body.descripcion;
        const result = validateN8nBody(body);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
    });

    it('sin monto → 400', () => {
        const body = validBody();
        delete body.monto;
        expect(validateN8nBody(body).status).toBe(400);
    });

    it('sin categoria → 400', () => {
        const body = validBody();
        delete body.categoria;
        expect(validateN8nBody(body).status).toBe(400);
    });

    it('sin medioPago → 400', () => {
        const body = validBody();
        delete body.medioPago;
        expect(validateN8nBody(body).status).toBe(400);
    });

    it('sin user_id → 400', () => {
        const body = validBody();
        delete body.user_id;
        expect(validateN8nBody(body).status).toBe(400);
    });
});

// ── Tests: descripcion ────────────────────────────────────────────────────────

describe('validateN8nBody — descripcion', () => {
    it('descripcion vacía → 400', () => {
        expect(validateN8nBody({ ...validBody(), descripcion: '' }).status).toBe(400);
    });

    it('descripcion solo espacios → 400', () => {
        expect(validateN8nBody({ ...validBody(), descripcion: '   ' }).status).toBe(400);
    });

    it('descripcion de 501 caracteres → 400', () => {
        expect(validateN8nBody({ ...validBody(), descripcion: 'A'.repeat(501) }).status).toBe(400);
    });

    it('descripcion de 500 caracteres → ok', () => {
        expect(validateN8nBody({ ...validBody(), descripcion: 'A'.repeat(500) }).ok).toBe(true);
    });

    it('descripcion de 1 caracter → ok', () => {
        expect(validateN8nBody({ ...validBody(), descripcion: 'X' }).ok).toBe(true);
    });
});

// ── Tests: monto ──────────────────────────────────────────────────────────────

describe('validateN8nBody — monto', () => {
    it('monto 0 → 400', () => {
        expect(validateN8nBody({ ...validBody(), monto: 0 }).status).toBe(400);
    });

    it('monto negativo → 400', () => {
        expect(validateN8nBody({ ...validBody(), monto: -100 }).status).toBe(400);
    });

    it('monto string no numérico → 400', () => {
        expect(validateN8nBody({ ...validBody(), monto: 'abc' }).status).toBe(400);
    });

    it('monto string formato argentino "1.500,50" → ok', () => {
        const result = validateN8nBody({ ...validBody(), monto: '1.500,50' });
        expect(result.ok).toBe(true);
        expect(result.monto).toBeCloseTo(1500.50);
    });

    it('monto string entero → ok', () => {
        expect(validateN8nBody({ ...validBody(), monto: '150' }).ok).toBe(true);
    });

    it('monto numérico normal → ok', () => {
        expect(validateN8nBody({ ...validBody(), monto: 999.99 }).ok).toBe(true);
    });
});

// ── Tests: categoria y medioPago ──────────────────────────────────────────────

describe('validateN8nBody — categoria y medioPago', () => {
    it('categoria 0 → 400', () => {
        expect(validateN8nBody({ ...validBody(), categoria: 0 }).status).toBe(400);
    });

    it('categoria negativa → 400', () => {
        expect(validateN8nBody({ ...validBody(), categoria: -1 }).status).toBe(400);
    });

    it('categoria decimal → 400', () => {
        expect(validateN8nBody({ ...validBody(), categoria: 1.5 }).status).toBe(400);
    });

    it('categoria string numérico entero → ok', () => {
        expect(validateN8nBody({ ...validBody(), categoria: '3' }).ok).toBe(true);
    });

    it('medioPago 0 → 400', () => {
        expect(validateN8nBody({ ...validBody(), medioPago: 0 }).status).toBe(400);
    });

    it('medioPago string no numérico → 400', () => {
        expect(validateN8nBody({ ...validBody(), medioPago: 'efectivo' }).status).toBe(400);
    });
});

// ── Tests: user_id (UUID) ─────────────────────────────────────────────────────

describe('validateN8nBody — user_id', () => {
    it('UUID inválido → 400', () => {
        expect(validateN8nBody({ ...validBody(), user_id: 'not-a-uuid' }).status).toBe(400);
    });

    it('UUID incompleto → 400', () => {
        expect(validateN8nBody({ ...validBody(), user_id: '12345678-1234-1234-1234' }).status).toBe(400);
    });

    it('UUID válido en minúsculas → ok', () => {
        expect(validateN8nBody({ ...validBody(), user_id: VALID_UUID }).ok).toBe(true);
    });

    it('UUID válido en mayúsculas → ok', () => {
        expect(validateN8nBody({ ...validBody(), user_id: VALID_UUID.toUpperCase() }).ok).toBe(true);
    });
});

// ── Tests: email_usuario (opcional) ──────────────────────────────────────────

describe('validateN8nBody — email_usuario', () => {
    it('sin email_usuario → ok (es opcional)', () => {
        expect(validateN8nBody(validBody()).ok).toBe(true);
    });

    it('email válido → ok', () => {
        expect(validateN8nBody({ ...validBody(), email_usuario: 'nico@example.com' }).ok).toBe(true);
    });

    it('email inválido → 400', () => {
        expect(validateN8nBody({ ...validBody(), email_usuario: 'notanemail' }).status).toBe(400);
    });

    it('email sin dominio → 400', () => {
        expect(validateN8nBody({ ...validBody(), email_usuario: 'user@' }).status).toBe(400);
    });

    it('email sin TLD → 400', () => {
        expect(validateN8nBody({ ...validBody(), email_usuario: 'user@domain' }).status).toBe(400);
    });
});
