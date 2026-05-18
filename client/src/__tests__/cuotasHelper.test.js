/**
 * Tests para cuotasHelper.js — importa las funciones reales, no réplicas.
 * Cubre: calcularCuotas + calcularDivisionIgualitaria.
 *
 * Motivación: bug timezone detectado en servidor. new Date("YYYY-MM-DDT00:00:00")
 * sin sufijo UTC desplazaba un mes cuando el proceso corría en UTC.
 * El fix usa aritmética de strings pura. Estos tests lo verifican.
 */

import { describe, it, expect } from 'vitest';
import { calcularCuotas, calcularDivisionIgualitaria } from '../lib/cuotasHelper';

// ─────────────────────────────────────────────────────────────────────────────
// calcularCuotas — regresión timezone (el bug original)
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularCuotas — regresión timezone', () => {
    it('primera cuota en junio cuando el usuario elige junio (YYYY-MM)', () => {
        const resultado = calcularCuotas(1000, 3, '2025-06');
        expect(resultado[0].fecha).toBe('2025-06-01');
    });

    it('primera cuota en junio cuando el usuario elige junio (YYYY-MM-DD)', () => {
        const resultado = calcularCuotas(1000, 3, '2025-06-01');
        expect(resultado[0].fecha).toBe('2025-06-01');
    });

    it('no retrocede un mes con entrada en enero', () => {
        const resultado = calcularCuotas(500, 2, '2026-01');
        expect(resultado[0].fecha).toBe('2026-01-01');
        expect(resultado[1].fecha).toBe('2026-02-01');
    });

    it('no retrocede un mes con entrada en marzo', () => {
        const resultado = calcularCuotas(900, 3, '2026-03');
        expect(resultado[0].fecha).toBe('2026-03-01');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularCuotas — fechas
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularCuotas — fechas', () => {
    it('las cuotas avanzan mes a mes', () => {
        const resultado = calcularCuotas(300, 3, '2026-05');
        expect(resultado[0].fecha).toBe('2026-05-01');
        expect(resultado[1].fecha).toBe('2026-06-01');
        expect(resultado[2].fecha).toBe('2026-07-01');
    });

    it('cruza fin de año correctamente (noviembre → diciembre → enero)', () => {
        const resultado = calcularCuotas(200, 3, '2026-11');
        expect(resultado[0].fecha).toBe('2026-11-01');
        expect(resultado[1].fecha).toBe('2026-12-01');
        expect(resultado[2].fecha).toBe('2027-01-01');
    });

    it('cruza año desde diciembre', () => {
        const resultado = calcularCuotas(300, 3, '2026-12');
        expect(resultado[0].fecha).toBe('2026-12-01');
        expect(resultado[1].fecha).toBe('2027-01-01');
        expect(resultado[2].fecha).toBe('2027-02-01');
    });

    it('18 cuotas desde enero cruzan correctamente hasta junio del año siguiente', () => {
        const resultado = calcularCuotas(1800, 18, '2026-01');
        expect(resultado[0].fecha).toBe('2026-01-01');
        expect(resultado[11].fecha).toBe('2026-12-01');
        expect(resultado[12].fecha).toBe('2027-01-01');
        expect(resultado[17].fecha).toBe('2027-06-01');
    });

    it('1 cuota: fecha igual al mes elegido', () => {
        const resultado = calcularCuotas(500, 1, '2026-08');
        expect(resultado[0].fecha).toBe('2026-08-01');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularCuotas — montos
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularCuotas — montos', () => {
    it('suma total es exactamente el monto original', () => {
        const casos = [
            [100, 3],
            [999.99, 4],
            [1000, 6],
            [0.10, 3],
            [500, 12],
            [1, 1],
        ];
        casos.forEach(([monto, n]) => {
            const resultado = calcularCuotas(monto, n, '2026-05');
            const suma = resultado.reduce((s, r) => s + r.monto, 0);
            expect(Math.round(suma * 100)).toBe(Math.round(monto * 100));
        });
    });

    it('diferencia de centavos va a la primera cuota', () => {
        // 100 / 3 = 33.33... → primera 33.34, resto 33.33
        const resultado = calcularCuotas(100, 3, '2026-05');
        expect(resultado[0].monto).toBe(33.34);
        expect(resultado[1].monto).toBe(33.33);
        expect(resultado[2].monto).toBe(33.33);
    });

    it('sin diferencia de redondeo: todas las cuotas son iguales', () => {
        const resultado = calcularCuotas(90, 3, '2026-05');
        resultado.forEach(r => expect(r.monto).toBe(30));
    });

    it('1 cuota: el monto completo va en la primera', () => {
        const resultado = calcularCuotas(500, 1, '2026-05');
        expect(resultado[0].monto).toBe(500);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularCuotas — cantidad y clamping
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularCuotas — cantidad de registros', () => {
    it('genera exactamente N cuotas', () => {
        expect(calcularCuotas(300, 3, '2026-05')).toHaveLength(3);
        expect(calcularCuotas(100, 1, '2026-05')).toHaveLength(1);
        expect(calcularCuotas(1800, 18, '2026-05')).toHaveLength(18);
    });

    it('clampea cuotas < 1 a 1', () => {
        expect(calcularCuotas(100, 0, '2026-05')).toHaveLength(1);
    });

    it('clampea cuotas > 18 a 18', () => {
        expect(calcularCuotas(1000, 99, '2026-05')).toHaveLength(18);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularCuotas — descripción y número
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularCuotas — descripción', () => {
    it('1 cuota: sin sufijo', () => {
        const resultado = calcularCuotas(100, 1, '2026-05', 'NETFLIX');
        expect(resultado[0].descripcion).toBe('NETFLIX');
    });

    it('N cuotas: sufijo (i/N) en cada cuota', () => {
        const resultado = calcularCuotas(300, 3, '2026-05', 'VIAJE');
        expect(resultado[0].descripcion).toBe('VIAJE (1/3)');
        expect(resultado[1].descripcion).toBe('VIAJE (2/3)');
        expect(resultado[2].descripcion).toBe('VIAJE (3/3)');
    });

    it('numero arranca en 1 y es consecutivo', () => {
        const resultado = calcularCuotas(300, 3, '2026-05', 'X');
        resultado.forEach((r, i) => expect(r.numero).toBe(i + 1));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularDivisionIgualitaria
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularDivisionIgualitaria — suma exacta', () => {
    const casos = [
        [100, ['a', 'b', 'c'], 'a'],
        [999.99, ['a', 'b'], 'a'],
        [1, ['a', 'b', 'c'], 'b'],
        [0.10, ['a', 'b', 'c'], 'a'],
    ];

    casos.forEach(([monto, ids, pagador]) => {
        it(`${monto} entre ${ids.length} suma exactamente el total`, () => {
            const resultado = calcularDivisionIgualitaria(monto, ids, pagador);
            const suma = resultado.reduce((s, r) => s + r.monto_asignado, 0);
            expect(Math.round(suma * 100)).toBe(Math.round(monto * 100));
        });
    });
});

describe('calcularDivisionIgualitaria — diferencia de centavos', () => {
    it('la diferencia va al pagador si participa', () => {
        // 100 / 3 = 33.33... → diferencia 0.01 al pagador
        const resultado = calcularDivisionIgualitaria(100, ['pagador', 'b', 'c'], 'pagador');
        const pagador = resultado.find(r => r.user_id === 'pagador');
        expect(pagador.monto_asignado).toBe(33.34);
        resultado.filter(r => r.user_id !== 'pagador').forEach(r => {
            expect(r.monto_asignado).toBe(33.33);
        });
    });

    it('la diferencia va al primer participante si el pagador no participa', () => {
        const resultado = calcularDivisionIgualitaria(100, ['a', 'b', 'c'], 'pagador-externo');
        expect(resultado[0].monto_asignado).toBe(33.34);
        expect(resultado[1].monto_asignado).toBe(33.33);
        expect(resultado[2].monto_asignado).toBe(33.33);
    });

    it('sin diferencia: todos pagan lo mismo', () => {
        const resultado = calcularDivisionIgualitaria(90, ['a', 'b', 'c'], 'a');
        resultado.forEach(r => expect(r.monto_asignado).toBe(30));
    });
});

describe('calcularDivisionIgualitaria — estructura', () => {
    it('retorna un entry por participante con user_id y monto_asignado', () => {
        const resultado = calcularDivisionIgualitaria(100, ['u1', 'u2'], 'u1');
        expect(resultado).toHaveLength(2);
        expect(resultado[0]).toHaveProperty('user_id', 'u1');
        expect(resultado[0]).toHaveProperty('monto_asignado');
        expect(resultado[1]).toHaveProperty('user_id', 'u2');
    });

    it('1 solo participante: absorbe el total', () => {
        const resultado = calcularDivisionIgualitaria(150, ['solo'], 'solo');
        expect(resultado[0].monto_asignado).toBe(150);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integración: calcularCuotas + calcularDivisionIgualitaria
// Simula el flujo real: dividir cada cuota entre participantes
// ─────────────────────────────────────────────────────────────────────────────

describe('integración: cuotas grupales — monto por persona', () => {
    it('cada participante paga el monto correcto por cuota en un escenario real', () => {
        // Compra de $1500 en 3 cuotas, primera en junio, 3 participantes
        const cuotas = calcularCuotas(1500, 3, '2025-06', 'VIAJE');
        expect(cuotas[0].fecha).toBe('2025-06-01'); // regresión timezone

        const division = calcularDivisionIgualitaria(
            cuotas[0].monto,
            ['pagador', 'b', 'c'],
            'pagador'
        );
        const suma = division.reduce((s, r) => s + r.monto_asignado, 0);
        expect(Math.round(suma * 100)).toBe(Math.round(cuotas[0].monto * 100));
    });

    it('18 cuotas desde enero: última cuota es en junio del año siguiente', () => {
        const cuotas = calcularCuotas(18000, 18, '2026-01', 'TV');
        expect(cuotas[17].fecha).toBe('2027-06-01');
        expect(cuotas[0].fecha).toBe('2026-01-01');
    });
});
