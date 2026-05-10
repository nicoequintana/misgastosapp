/**
 * Tests para la lógica de cálculo de cuotas de tarjeta de crédito.
 * La función está embebida en createExpense (db.js). Se extrae inline
 * para testear de forma aislada sin necesidad de mockear Supabase.
 *
 * Lógica original: client/src/lib/db.js → createExpense (líneas 133-165)
 */

import { describe, it, expect } from 'vitest';

// Réplica exacta del algoritmo de createExpense
function calcularCuotas(montoTotal, cuotasN, fechaBase) {
    const cuotas = Math.max(1, Math.min(18, cuotasN));
    const montoPorCuota = Math.floor((montoTotal / cuotas) * 100) / 100;
    const diferencia = Math.round((montoTotal - montoPorCuota * cuotas) * 100) / 100;

    // fechaBase: 1er día del mes siguiente a la fecha ingresada
    const base = new Date(`${fechaBase}T00:00:00`);
    base.setDate(1);
    base.setMonth(base.getMonth() + 1);

    return Array.from({ length: cuotas }, (_, i) => {
        const fechaCuota = new Date(base);
        fechaCuota.setMonth(base.getMonth() + i);

        const monto = i === 0
            ? Math.round((montoPorCuota + diferencia) * 100) / 100
            : montoPorCuota;

        const descripcion = cuotas > 1
            ? `DESCRIPCION (${i + 1}/${cuotas})`
            : 'DESCRIPCION';

        return {
            numero_cuota: i + 1,
            monto,
            descripcion,
            fecha: fechaCuota.toISOString().split('T')[0],
        };
    });
}

// ── Monto total ───────────────────────────────────────────────────────────────

describe('calcularCuotas — suma total exacta', () => {
    const casos = [
        [100, 3, '2026-05-10'],
        [1000, 6, '2026-01-01'],
        [999.99, 4, '2026-03-15'],
        [0.10, 3, '2026-05-01'],
        [500, 12, '2026-05-10'],
        [1, 1, '2026-05-10'],
    ];

    casos.forEach(([monto, n, fecha]) => {
        it(`${monto} en ${n} cuota(s) suma exactamente el total`, () => {
            const resultado = calcularCuotas(monto, n, fecha);
            const suma = resultado.reduce((s, r) => s + r.monto, 0);
            expect(Math.round(suma * 100)).toBe(Math.round(monto * 100));
        });
    });
});

// ── Cantidad de cuotas ────────────────────────────────────────────────────────

describe('calcularCuotas — cantidad de registros', () => {
    it('genera exactamente N cuotas', () => {
        expect(calcularCuotas(300, 3, '2026-05-10')).toHaveLength(3);
        expect(calcularCuotas(100, 1, '2026-05-10')).toHaveLength(1);
        expect(calcularCuotas(1800, 18, '2026-05-10')).toHaveLength(18);
    });

    it('clampea cuotas < 1 a 1', () => {
        expect(calcularCuotas(100, 0, '2026-05-10')).toHaveLength(1);
    });

    it('clampea cuotas > 18 a 18', () => {
        expect(calcularCuotas(1000, 99, '2026-05-10')).toHaveLength(18);
    });
});

// ── Diferencia de centavos ────────────────────────────────────────────────────

describe('calcularCuotas — ajuste de centavos', () => {
    it('la diferencia por redondeo va a la primera cuota', () => {
        // 100 / 3 = 33.33 con diferencia 0.01 → primera cuota 33.34
        const resultado = calcularCuotas(100, 3, '2026-05-10');
        expect(resultado[0].monto).toBe(33.34);
        expect(resultado[1].monto).toBe(33.33);
        expect(resultado[2].monto).toBe(33.33);
    });

    it('sin diferencia: todas las cuotas son iguales', () => {
        // 90 / 3 = 30.00 exacto
        const resultado = calcularCuotas(90, 3, '2026-05-10');
        resultado.forEach(r => expect(r.monto).toBe(30));
    });
});

// ── Fechas ────────────────────────────────────────────────────────────────────

describe('calcularCuotas — fechas', () => {
    it('la primera cuota es el mes siguiente a la fecha de compra', () => {
        const resultado = calcularCuotas(100, 3, '2026-05-10');
        expect(resultado[0].fecha).toBe('2026-06-01');
    });

    it('las cuotas son consecutivas mes a mes', () => {
        const resultado = calcularCuotas(300, 3, '2026-05-10');
        expect(resultado[0].fecha).toBe('2026-06-01');
        expect(resultado[1].fecha).toBe('2026-07-01');
        expect(resultado[2].fecha).toBe('2026-08-01');
    });

    it('cruza fin de año correctamente (diciembre → enero del año siguiente)', () => {
        const resultado = calcularCuotas(200, 2, '2026-11-15');
        expect(resultado[0].fecha).toBe('2026-12-01');
        expect(resultado[1].fecha).toBe('2027-01-01');
    });

    it('cruza año desde diciembre', () => {
        const resultado = calcularCuotas(300, 3, '2026-12-01');
        expect(resultado[0].fecha).toBe('2027-01-01');
        expect(resultado[1].fecha).toBe('2027-02-01');
        expect(resultado[2].fecha).toBe('2027-03-01');
    });
});

// ── Descripción ───────────────────────────────────────────────────────────────

describe('calcularCuotas — descripción', () => {
    it('1 cuota: sin sufijo de cuota', () => {
        const resultado = calcularCuotas(100, 1, '2026-05-10');
        expect(resultado[0].descripcion).toBe('DESCRIPCION');
    });

    it('N cuotas: incluye sufijo (i/N)', () => {
        const resultado = calcularCuotas(300, 3, '2026-05-10');
        expect(resultado[0].descripcion).toBe('DESCRIPCION (1/3)');
        expect(resultado[1].descripcion).toBe('DESCRIPCION (2/3)');
        expect(resultado[2].descripcion).toBe('DESCRIPCION (3/3)');
    });
});

// ── número_cuota ──────────────────────────────────────────────────────────────

describe('calcularCuotas — numero_cuota', () => {
    it('numero_cuota arranca en 1 y es consecutivo', () => {
        const resultado = calcularCuotas(300, 3, '2026-05-10');
        resultado.forEach((r, i) => expect(r.numero_cuota).toBe(i + 1));
    });
});