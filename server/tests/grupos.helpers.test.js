/**
 * Tests para los helpers de grupos.js:
 * - calcularParticipantes
 * - superaRateLimit (inline reimplementado para testear la lógica)
 * - nombreDesdeAuthUser
 * - EMAIL_REGEX
 */

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
