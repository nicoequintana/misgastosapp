/**
 * Tests de la lógica de cálculo de división igualitaria.
 * Se extraen inline porque la función está embebida en los endpoints.
 * Misma lógica que calcularParticipantes() en server/routes/grupos.js
 * y crearGastoGrupal() en db.js.
 */

import { describe, it, expect } from 'vitest';

// Réplica de la función de cálculo para testearla de forma aislada
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

describe('calcularParticipantes — división igualitaria', () => {
    it('divide exactamente entre 2 personas sin resto', () => {
        const result = calcularParticipantes(1, 100, 'userA', ['userA', 'userB']);
        expect(result).toHaveLength(2);
        expect(result[0].monto_asignado).toBe(50);
        expect(result[1].monto_asignado).toBe(50);
        const total = result.reduce((s, r) => s + r.monto_asignado, 0);
        expect(Math.round(total * 100)).toBe(Math.round(100 * 100));
    });

    it('divide con centavos de resto: el ajuste va al pagador', () => {
        // 10 / 3 = 3.33 con 0.01 de diferencia
        const result = calcularParticipantes(2, 10, 'userB', ['userA', 'userB', 'userC']);
        const total = result.reduce((s, r) => s + r.monto_asignado, 0);
        // La suma total debe ser exactamente 10.00
        expect(Math.round(total * 100)).toBe(1000);
        // El pagador (userB, index 1) recibe el centavo extra
        expect(result[1].monto_asignado).toBeGreaterThanOrEqual(result[0].monto_asignado);
    });

    it('ajuste va al primer participante si el pagador no participa', () => {
        const result = calcularParticipantes(3, 10, 'userZ', ['userA', 'userB', 'userC']);
        const total = result.reduce((s, r) => s + r.monto_asignado, 0);
        expect(Math.round(total * 100)).toBe(1000);
        // userZ no está en la lista → ajuste al primer participante (index 0)
        expect(result[0].monto_asignado).toBeGreaterThanOrEqual(result[1].monto_asignado);
    });

    it('un solo participante recibe el monto completo', () => {
        const result = calcularParticipantes(4, 50, 'userA', ['userA']);
        expect(result).toHaveLength(1);
        expect(result[0].monto_asignado).toBe(50);
    });

    it('todos los gasto_id son correctos', () => {
        const result = calcularParticipantes(99, 30, 'userA', ['userA', 'userB', 'userC']);
        result.forEach((r) => expect(r.gasto_id).toBe(99));
    });

    it('user_ids coinciden con los participantes en orden', () => {
        const participantes = ['u1', 'u2', 'u3'];
        const result = calcularParticipantes(1, 90, 'u1', participantes);
        result.forEach((r, i) => expect(r.user_id).toBe(participantes[i]));
    });

    it('no genera montos negativos ni cero', () => {
        const result = calcularParticipantes(1, 0.03, 'u1', ['u1', 'u2', 'u3']);
        result.forEach((r) => expect(r.monto_asignado).toBeGreaterThan(0));
    });
});

describe('deduplicación de participantes', () => {
    it('Set elimina duplicados antes del cálculo', () => {
        const raw = ['userA', 'userA', 'userB'];
        const unicos = [...new Set(raw)];
        expect(unicos).toHaveLength(2);
        expect(unicos).toEqual(['userA', 'userB']);
    });

    it('un solo id repetido queda como uno solo', () => {
        const raw = ['userX', 'userX', 'userX'];
        const unicos = [...new Set(raw)];
        expect(unicos).toHaveLength(1);
    });
});
