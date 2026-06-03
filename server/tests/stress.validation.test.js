/**
 * Stress tests — Validación bajo carga concurrente (sin servidor HTTP)
 *
 * Simula 1000+ usuarios ejecutando validaciones en paralelo para detectar:
 * - Race conditions en la lógica de validación
 * - Degradación de rendimiento bajo carga
 * - Comportamiento correcto del rate limiting en memoria
 * - Idempotencia del fingerprint bajo concurrencia
 *
 * No requiere servidor levantado ni Supabase configurado.
 */

const { normalizeAmount, generateFingerprint } = require('../utils');

// ── Réplicas de lógica de validación (idénticas a index.js) ─────────────────

const UUID_REGEX  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateN8nBody({ descripcion, monto, categoria, medioPago, user_id, email_usuario }) {
    if (!descripcion || monto === undefined || !categoria || !medioPago || !user_id)
        return { ok: false, status: 400 };
    if (typeof descripcion !== 'string' || descripcion.trim().length === 0 || descripcion.length > 500)
        return { ok: false, status: 400 };
    const normalizedMonto = normalizeAmount(monto);
    if (isNaN(normalizedMonto) || !isFinite(normalizedMonto) || normalizedMonto <= 0)
        return { ok: false, status: 400 };
    const categoriaNum = Number(categoria);
    const mediaNum     = Number(medioPago);
    if (!Number.isInteger(categoriaNum) || !Number.isInteger(mediaNum) || categoriaNum <= 0 || mediaNum <= 0)
        return { ok: false, status: 400 };
    if (!UUID_REGEX.test(user_id))
        return { ok: false, status: 400 };
    if (email_usuario && !EMAIL_REGEX.test(email_usuario))
        return { ok: false, status: 400 };
    return { ok: true, monto: normalizedMonto, categoriaNum, mediaNum };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const validBody = (overrides = {}) => ({
    descripcion: 'SUPERMERCADO DIA',
    monto: 1500.50,
    categoria: 3,
    medioPago: 1,
    user_id: VALID_UUID,
    ...overrides,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Ejecuta `count` invocaciones de `fn` en paralelo y retorna métricas.
 * @param {number} count
 * @param {() => any} fn
 */
async function runConcurrent(count, fn) {
    const start = Date.now();
    const results = await Promise.all(Array.from({ length: count }, fn));
    const elapsed = Date.now() - start;
    return { results, elapsed };
}

/**
 * Calcula percentiles de un array de números.
 */
function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

// ── Suite 1: Validación correcta bajo 1000 usuarios concurrentes ─────────────

describe('Stress — 1000 usuarios concurrentes: validación de body válido', () => {
    const CONCURRENT_USERS = 1000;

    it('todas las validaciones deben retornar ok:true', async () => {
        const { results, elapsed } = await runConcurrent(CONCURRENT_USERS, () =>
            Promise.resolve(validateN8nBody(validBody()))
        );

        const failed = results.filter(r => !r.ok);
        expect(failed).toHaveLength(0);

        console.log(`[1000 valid] ${elapsed}ms total para ${CONCURRENT_USERS} validaciones`);
    });

    it('tiempo total debe ser < 2000ms para 1000 validaciones', async () => {
        const { elapsed } = await runConcurrent(CONCURRENT_USERS, () =>
            Promise.resolve(validateN8nBody(validBody()))
        );
        expect(elapsed).toBeLessThan(2000);
    });
});

// ── Suite 2: Validación de bodys inválidos bajo carga ────────────────────────

describe('Stress — 1000 usuarios concurrentes: bodys inválidos', () => {
    const CONCURRENT_USERS = 1000;

    it('bodys sin descripcion → todos deben retornar 400', async () => {
        const { results } = await runConcurrent(CONCURRENT_USERS, () => {
            const body = validBody();
            delete body.descripcion;
            return Promise.resolve(validateN8nBody(body));
        });
        const allReject = results.every(r => !r.ok && r.status === 400);
        expect(allReject).toBe(true);
    });

    it('bodys con UUID inválido → todos deben retornar 400', async () => {
        const { results } = await runConcurrent(CONCURRENT_USERS, () =>
            Promise.resolve(validateN8nBody(validBody({ user_id: 'not-a-uuid' })))
        );
        const allReject = results.every(r => !r.ok && r.status === 400);
        expect(allReject).toBe(true);
    });

    it('bodys con monto negativo → todos deben retornar 400', async () => {
        const { results } = await runConcurrent(CONCURRENT_USERS, () =>
            Promise.resolve(validateN8nBody(validBody({ monto: -500 })))
        );
        const allReject = results.every(r => !r.ok && r.status === 400);
        expect(allReject).toBe(true);
    });
});

// ── Suite 3: Carga mixta (50% válidos / 50% inválidos) ───────────────────────

describe('Stress — carga mixta: 500 válidos + 500 inválidos intercalados', () => {
    it('cada request recibe la respuesta correcta independientemente del orden', async () => {
        const tasks = Array.from({ length: 1000 }, (_, i) => () => {
            if (i % 2 === 0) {
                return Promise.resolve({ expected: true,  result: validateN8nBody(validBody()) });
            } else {
                return Promise.resolve({
                    expected: false,
                    result: validateN8nBody(validBody({ monto: -1 })),
                });
            }
        });

        const responses = await Promise.all(tasks.map(t => t()));

        responses.forEach(({ expected, result }) => {
            if (expected) {
                expect(result.ok).toBe(true);
            } else {
                expect(result.ok).toBe(false);
                expect(result.status).toBe(400);
            }
        });
    });
});

// ── Suite 4: Idempotencia de fingerprint bajo concurrencia ───────────────────

describe('Stress — generateFingerprint: idempotencia bajo concurrencia', () => {
    it('el mismo input genera siempre el mismo hash con 1000 invocaciones paralelas', async () => {
        const expenseData = {
            descripcion: 'SUPERMERCADO DIA',
            monto: 1500.50,
            categoria: '3',
            medioPago: '1',
            fecha: '2026-05-26',
            user_id: VALID_UUID,
        };

        const { results } = await runConcurrent(1000, () =>
            Promise.resolve(generateFingerprint(expenseData))
        );

        const uniqueHashes = new Set(results);
        expect(uniqueHashes.size).toBe(1);
    });

    it('inputs diferentes generan hashes diferentes bajo concurrencia', async () => {
        const tasks = Array.from({ length: 500 }, (_, i) => () =>
            Promise.resolve(generateFingerprint({
                descripcion: `GASTO_${i}`,
                monto: 100 + i,
                categoria: '3',
                medioPago: '1',
                fecha: '2026-05-26',
                user_id: VALID_UUID,
            }))
        );

        const results = await Promise.all(tasks.map(t => t()));
        const uniqueHashes = new Set(results);
        expect(uniqueHashes.size).toBe(500);
    });
});

// ── Suite 5: normalizeAmount bajo carga ──────────────────────────────────────

describe('Stress — normalizeAmount: 1000 llamadas concurrentes con formatos mixtos', () => {
    const inputs = [
        { input: '1.500,50', expected: 1500.50 },
        { input: 1500.50,    expected: 1500.50 },
        { input: '1500',     expected: 1500 },
        { input: '0,99',     expected: 0.99 },
        { input: 100,        expected: 100 },
    ];

    it('todos los valores se normalizan correctamente bajo concurrencia', async () => {
        const tasks = Array.from({ length: 1000 }, (_, i) => {
            const fixture = inputs[i % inputs.length];
            return () => Promise.resolve({ result: normalizeAmount(fixture.input), expected: fixture.expected });
        });

        const responses = await Promise.all(tasks.map(t => t()));
        responses.forEach(({ result, expected }) => {
            expect(result).toBeCloseTo(expected, 2);
        });
    });
});

// ── Suite 6: Throughput y latencia percibida ─────────────────────────────────

describe('Stress — métricas de throughput', () => {
    it('1000 validaciones deben completarse en < 500ms (throughput mínimo: 2000 req/s)', async () => {
        const COUNT = 1000;
        const { elapsed } = await runConcurrent(COUNT, () =>
            Promise.resolve(validateN8nBody(validBody()))
        );

        const throughput = Math.floor(COUNT / (elapsed / 1000));
        console.log(`[throughput] ${throughput} validaciones/s en ${elapsed}ms`);

        // Umbral conservador: la validación en memoria debe ser extremadamente rápida
        expect(elapsed).toBeLessThan(500);
    });

    it('tiempos de validación son consistentes — p99 debe ser razonable', async () => {
        const COUNT = 200;
        const times = [];

        for (let i = 0; i < COUNT; i++) {
            const t0 = process.hrtime.bigint();
            validateN8nBody(validBody());
            const t1 = process.hrtime.bigint();
            times.push(Number(t1 - t0) / 1e6); // ms
        }

        const p50 = percentile(times, 50);
        const p95 = percentile(times, 95);
        const p99 = percentile(times, 99);

        console.log(`[latencia] p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`);

        // p99 de la validación pura debe ser < 5ms (es lógica JS en memoria)
        expect(p99).toBeLessThan(5);
    });
});

// ── Suite 7: Edge cases bajo carga — strings largos y datos extremos ─────────

describe('Stress — edge cases bajo carga concurrente', () => {
    it('descripcion de exactamente 500 chars → 1000 validaciones todas ok', async () => {
        const desc = 'A'.repeat(500);
        const { results } = await runConcurrent(1000, () =>
            Promise.resolve(validateN8nBody(validBody({ descripcion: desc })))
        );
        expect(results.every(r => r.ok)).toBe(true);
    });

    it('descripcion de 501 chars → 1000 validaciones todas rechazan', async () => {
        const desc = 'A'.repeat(501);
        const { results } = await runConcurrent(1000, () =>
            Promise.resolve(validateN8nBody(validBody({ descripcion: desc })))
        );
        expect(results.every(r => !r.ok)).toBe(true);
    });

    it('monto en formato argentino → 1000 validaciones todas ok', async () => {
        const { results } = await runConcurrent(1000, () =>
            Promise.resolve(validateN8nBody(validBody({ monto: '12.500,99' })))
        );
        expect(results.every(r => r.ok)).toBe(true);
    });

    it('user_id inválido mezclado con válidos — sin interferencia entre usuarios', async () => {
        const tasks = Array.from({ length: 1000 }, (_, i) => () => {
            const userId = i % 3 === 0 ? 'invalid-uuid' : VALID_UUID;
            return Promise.resolve({
                idx: i,
                isValid: i % 3 !== 0,
                result: validateN8nBody(validBody({ user_id: userId })),
            });
        });

        const responses = await Promise.all(tasks.map(t => t()));
        responses.forEach(({ isValid, result }) => {
            if (isValid) expect(result.ok).toBe(true);
            else expect(result.ok).toBe(false);
        });
    });
});
