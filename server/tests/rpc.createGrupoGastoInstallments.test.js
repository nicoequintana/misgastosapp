/**
 * Tests para create_grupo_gasto_installments (fix del bug de atomicidad
 * encontrado durante R4, gemelo de C-01 pero para gastos GRUPALES en cuotas).
 * server/db/migrations/20260721_rpc_create_grupo_gasto_installments.sql
 *
 * El RPC vive en PL/pgSQL — estos tests replican en JS su lógica de división
 * de cada cuota entre participantes (misma fórmula que calcularParticipantes
 * en grupos.js y calcularDivisionIgualitaria en cuotasHelper.js: piso + la
 * diferencia de redondeo va al pagador, o al primer participante si el
 * pagador no está en la lista).
 */

// dividirEntreParticipantes — misma lógica que el bloque v_base_part/v_diferencia_part
// del RPC para UNA cuota dada.
function dividirEntreParticipantes(montoCuota, participantes, pagadoPor) {
    const n = participantes.length;
    if (n < 1) throw new Error('Se requiere al menos un participante');

    const base = Math.floor((montoCuota / n) * 100) / 100;
    const diferencia = Math.round((montoCuota - base * n) * 100) / 100;
    const idxPagador = participantes.indexOf(pagadoPor) !== -1
        ? participantes.indexOf(pagadoPor)
        : 0;

    return participantes.map((userId, idx) => ({
        user_id: userId,
        monto_asignado: idx === idxPagador
            ? Math.round((base + diferencia) * 100) / 100
            : base,
    }));
}

describe('dividirEntreParticipantes (create_grupo_gasto_installments)', () => {
    it('la suma de montos asignados siempre iguala el monto de la cuota', () => {
        const casos = [
            [300000, ['a', 'b', 'c'], 'a'],
            [100, ['a', 'b'], 'b'],
            [0.10, ['a', 'b', 'c'], 'a'],
            [999.99, ['a', 'b', 'c', 'd'], 'd'],
        ];
        casos.forEach(([monto, participantes, pagador]) => {
            const filas = dividirEntreParticipantes(monto, participantes, pagador);
            const suma = filas.reduce((s, f) => s + f.monto_asignado, 0);
            expect(Math.round(suma * 100)).toBe(Math.round(monto * 100));
        });
    });

    it('el pagador recibe la diferencia de redondeo cuando participa', () => {
        const filas = dividirEntreParticipantes(100, ['a', 'b', 'c'], 'b');
        const filaPagador = filas.find(f => f.user_id === 'b');
        const otras = filas.filter(f => f.user_id !== 'b');
        expect(otras.every(f => f.monto_asignado === otras[0].monto_asignado)).toBe(true);
        expect(filaPagador.monto_asignado).toBeGreaterThanOrEqual(otras[0].monto_asignado);
    });

    it('la diferencia va al primer participante si el pagador no está en la lista', () => {
        const filas = dividirEntreParticipantes(100, ['a', 'b', 'c'], 'x-no-participa');
        const suma = filas.reduce((s, f) => s + f.monto_asignado, 0);
        expect(Math.round(suma * 100)).toBe(10000);
        expect(filas[0].monto_asignado).toBeGreaterThanOrEqual(filas[1].monto_asignado);
    });

    it('genera exactamente una fila por participante único', () => {
        const filas = dividirEntreParticipantes(90, ['a', 'b', 'c'], 'a');
        expect(filas).toHaveLength(3);
    });

    it('con un solo participante, se lleva el monto completo de la cuota', () => {
        const filas = dividirEntreParticipantes(500, ['a'], 'a');
        expect(filas).toEqual([{ user_id: 'a', monto_asignado: 500 }]);
    });
});
