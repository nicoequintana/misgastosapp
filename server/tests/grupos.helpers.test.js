/**
 * Tests para los helpers de grupos.js:
 * - calcularParticipantes
 * - superaRateLimit (inline reimplementado para testear la lógica)
 * - nombreDesdeAuthUser
 * - EMAIL_REGEX
 * - validarParaUserIdLiquidacion (fix S-01: paraUserId sin validar)
 */

const UUID_REGEX_TEST = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// validarParaUserIdLiquidacion — misma lógica que en grupos.js (POST /liquidaciones).
// Recibe la lista de user_id de miembros activos del grupo (ya resuelta) para no
// acoplar el test a Supabase — el fetch real se cubre por separado en grupos.js.
function validarParaUserIdLiquidacion(paraUserId, miembrosActivosIds) {
    if (!UUID_REGEX_TEST.test(paraUserId)) {
        return { error: { status: 400, mensaje: 'paraUserId contiene un ID inválido' } };
    }
    if (!miembrosActivosIds.includes(paraUserId)) {
        return { error: { status: 400, mensaje: 'El receptor no es miembro activo del grupo' } };
    }
    return { ok: true };
}

// calcularParticipantes — mismo algoritmo que en grupos.js
function calcularParticipantes(gastoId, montoNum, pagadoPor, participantesUnicos) {
    const n = participantesUnicos.length;
    const base = Math.floor((montoNum / n) * 100) / 100;
    const diferencia = Math.round((montoNum - base * n) * 100) / 100;
    const indexAjuste = participantesUnicos.indexOf(pagadoPor) !== -1
        ? participantesUnicos.indexOf(pagadoPor)
        : 0;

    return participantesUnicos.map((uid, idx) => ({
        gasto_id: gastoId,
        user_id: uid,
        monto_asignado: idx === indexAjuste
            ? Math.round((base + diferencia) * 100) / 100
            : base,
    }));
}

// nombreDesdeAuthUser — mismo código que en grupos.js
function nombreDesdeAuthUser(authUser) {
    if (!authUser) return null;
    const metadata = authUser.user_metadata || {};
    const nombre = metadata.full_name || metadata.name || null;
    if (nombre && String(nombre).trim()) return String(nombre).trim();
    if (authUser.email && String(authUser.email).includes('@')) {
        return String(authUser.email).split('@')[0];
    }
    return null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Tests ──────────────────────────────────────────────────────────────

describe('calcularParticipantes (backend)', () => {
    it('la suma de montos siempre iguala el total', () => {
        const casos = [
            [1, 100, 'A', ['A', 'B']],
            [2, 10, 'B', ['A', 'B', 'C']],
            [3, 0.10, 'A', ['A', 'B', 'C']],
            [4, 999.99, 'D', ['A', 'B', 'C', 'D']],
        ];
        casos.forEach(([id, monto, pag, parts]) => {
            const rows = calcularParticipantes(id, monto, pag, parts);
            const suma = rows.reduce((s, r) => s + r.monto_asignado, 0);
            expect(Math.round(suma * 100)).toBe(Math.round(monto * 100));
        });
    });

    it('genera una fila por participante único', () => {
        const rows = calcularParticipantes(1, 90, 'A', ['A', 'B', 'C']);
        expect(rows).toHaveLength(3);
    });

    it('todos tienen el mismo gasto_id', () => {
        const rows = calcularParticipantes(77, 60, 'A', ['A', 'B']);
        rows.forEach(r => expect(r.gasto_id).toBe(77));
    });
});

describe('nombreDesdeAuthUser', () => {
    it('retorna null si authUser es null', () => {
        expect(nombreDesdeAuthUser(null)).toBeNull();
    });

    it('usa full_name si está disponible', () => {
        const user = { user_metadata: { full_name: 'Nicolás Q' }, email: 'nico@test.com' };
        expect(nombreDesdeAuthUser(user)).toBe('Nicolás Q');
    });

    it('usa name como fallback de full_name', () => {
        const user = { user_metadata: { name: 'Nico' }, email: 'nico@test.com' };
        expect(nombreDesdeAuthUser(user)).toBe('Nico');
    });

    it('usa parte del email como último recurso', () => {
        const user = { user_metadata: {}, email: 'nico@example.com' };
        expect(nombreDesdeAuthUser(user)).toBe('nico');
    });

    it('retorna null si no hay metadata ni email', () => {
        const user = { user_metadata: {} };
        expect(nombreDesdeAuthUser(user)).toBeNull();
    });
});

// superaRateLimit — misma lógica que en grupos.js, parametrizada por un fetcher
// inyectado para no depender de Supabase real. Simula { count, error } como
// devuelve supabaseAdmin.from(...).select(..., { count: 'exact', head: true }).
const RATE_LIMIT_MAX_TEST = 10;
async function superaRateLimit(fetchConteo) {
    const { count, error } = await fetchConteo();

    if (error) {
        // Fail closed (fix S-03): ante error de DB, bloquear el request.
        return true;
    }

    return (count ?? 0) >= RATE_LIMIT_MAX_TEST;
}

describe('superaRateLimit (fix S-03: fail-closed ante error de DB)', () => {
    it('permite el request si el conteo está por debajo del límite', async () => {
        const resultado = await superaRateLimit(async () => ({ count: 3, error: null }));
        expect(resultado).toBe(false);
    });

    it('bloquea el request si el conteo alcanzó el límite', async () => {
        const resultado = await superaRateLimit(async () => ({ count: 10, error: null }));
        expect(resultado).toBe(true);
    });

    it('bloquea el request si el conteo supera el límite', async () => {
        const resultado = await superaRateLimit(async () => ({ count: 15, error: null }));
        expect(resultado).toBe(true);
    });

    it('FAIL CLOSED: bloquea el request si la query de conteo falla', async () => {
        const resultado = await superaRateLimit(async () => ({ count: null, error: new Error('timeout de DB') }));
        expect(resultado).toBe(true);
    });

    it('permite el request si count es null pero no hay error (grupo sin invitaciones aún)', async () => {
        const resultado = await superaRateLimit(async () => ({ count: null, error: null }));
        expect(resultado).toBe(false);
    });
});

describe('validarParaUserIdLiquidacion (fix S-01)', () => {
    const miembrosActivos = ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'];

    it('rechaza paraUserId que no es un UUID válido', () => {
        const resultado = validarParaUserIdLiquidacion('no-es-un-uuid', miembrosActivos);
        expect(resultado.error).toBeDefined();
        expect(resultado.error.status).toBe(400);
        expect(resultado.error.mensaje).toMatch(/inválid/i);
    });

    it('rechaza paraUserId que es un UUID válido pero no es miembro activo del grupo', () => {
        const uuidAjeno = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
        const resultado = validarParaUserIdLiquidacion(uuidAjeno, miembrosActivos);
        expect(resultado.error).toBeDefined();
        expect(resultado.error.mensaje).toMatch(/miembro activo/i);
    });

    it('acepta paraUserId cuando es un UUID válido y miembro activo del grupo', () => {
        const resultado = validarParaUserIdLiquidacion(miembrosActivos[1], miembrosActivos);
        expect(resultado.ok).toBe(true);
        expect(resultado.error).toBeUndefined();
    });
});

describe('EMAIL_REGEX', () => {
    it('acepta emails válidos', () => {
        const validos = [
            'test@example.com',
            'user.name+tag@domain.co',
            'a@b.io',
            'nico@automatizaciones.quintech.com',
        ];
        validos.forEach(e => expect(EMAIL_REGEX.test(e)).toBe(true));
    });

    it('rechaza emails inválidos', () => {
        const invalidos = [
            'noatsign',
            '@nodomain.com',
            'nodot@domain',
            'spaces in@email.com',
            '',
        ];
        invalidos.forEach(e => expect(EMAIL_REGEX.test(e)).toBe(false));
    });
});
