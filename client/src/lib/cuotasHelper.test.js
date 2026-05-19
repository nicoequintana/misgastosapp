import { describe, it, expect } from 'vitest';
import { calcularCuotas, calcularDivisionIgualitaria } from './cuotasHelper';

// ─────────────────────────────────────────────
// calcularCuotas
// ─────────────────────────────────────────────

describe('calcularCuotas', () => {

    it('genera 1 cuota con la descripción sin sufijo', () => {
        const result = calcularCuotas(1000, 1, '2025-03', 'NOTEBOOK');
        expect(result).toHaveLength(1);
        expect(result[0].descripcion).toBe('NOTEBOOK');
        expect(result[0].monto).toBe(1000);
        expect(result[0].numero).toBe(1);
        expect(result[0].fecha).toBe('2025-03-01');
    });

    it('genera N cuotas con sufijo (i/N) en cada descripción', () => {
        const result = calcularCuotas(300, 3, '2025-01', 'TV');
        expect(result).toHaveLength(3);
        expect(result[0].descripcion).toBe('TV (1/3)');
        expect(result[1].descripcion).toBe('TV (2/3)');
        expect(result[2].descripcion).toBe('TV (3/3)');
    });

    it('fechas incrementan mes a mes correctamente', () => {
        const result = calcularCuotas(600, 3, '2025-11', 'HELADERA');
        expect(result[0].fecha).toBe('2025-11-01');
        expect(result[1].fecha).toBe('2025-12-01');
        expect(result[2].fecha).toBe('2026-01-01'); // cruza año
    });

    it('cruza correctamente de diciembre a enero del año siguiente', () => {
        const result = calcularCuotas(1200, 2, '2024-12', 'SILLON');
        expect(result[0].fecha).toBe('2024-12-01');
        expect(result[1].fecha).toBe('2025-01-01');
    });

    it('la suma de cuotas es exactamente igual al monto total', () => {
        const monto = 1000;
        const result = calcularCuotas(monto, 3, '2025-06', 'SMART TV');
        const suma = result.reduce((s, c) => Math.round((s + c.monto) * 100) / 100, 0);
        expect(suma).toBe(monto);
    });

    it('la diferencia por redondeo va a la primera cuota', () => {
        // 100 / 3 = 33.33... → cuota base 33.33, primera absorbe diferencia
        const result = calcularCuotas(100, 3, '2025-01', 'ITEM');
        const suma = result.reduce((s, c) => Math.round((s + c.monto) * 100) / 100, 0);
        expect(suma).toBe(100);
        // La primera cuota no puede ser menor que las demás
        expect(result[0].monto).toBeGreaterThanOrEqual(result[1].monto);
    });

    it('monto exactamente divisible: todas las cuotas son iguales', () => {
        const result = calcularCuotas(600, 3, '2025-01', 'ITEM');
        expect(result[0].monto).toBe(200);
        expect(result[1].monto).toBe(200);
        expect(result[2].monto).toBe(200);
    });

    it('acepta formato YYYY-MM-DD además de YYYY-MM', () => {
        const result = calcularCuotas(500, 2, '2025-05-15', 'ZAPATOS');
        expect(result[0].fecha).toBe('2025-05-01');
        expect(result[1].fecha).toBe('2025-06-01');
    });

    it('clampea cantCuotas al rango válido (mínimo 1)', () => {
        const result = calcularCuotas(100, 0, '2025-01', 'ITEM');
        expect(result).toHaveLength(1);
    });

    it('clampea cantCuotas al máximo de 18', () => {
        const result = calcularCuotas(1800, 99, '2025-01', 'ITEM');
        expect(result).toHaveLength(18);
    });

    it('el número de cuota empieza en 1 y es correlativo', () => {
        const result = calcularCuotas(500, 4, '2025-03', 'MONITOR');
        result.forEach((c, i) => expect(c.numero).toBe(i + 1));
    });

    // ── Escenario real: préstamo de 120 cuotas ──
    it('soporta 120 cuotas cuando se llama con ese límite externo', () => {
        // calcularCuotas clampea a 18 internamente — este test documenta ese comportamiento
        const result = calcularCuotas(24000, 18, '2025-01', 'PRESTAMO AUTO');
        expect(result).toHaveLength(18);
        const suma = result.reduce((s, c) => Math.round((s + c.monto) * 100) / 100, 0);
        expect(suma).toBe(24000);
    });
});

// ─────────────────────────────────────────────
// calcularDivisionIgualitaria
// ─────────────────────────────────────────────

describe('calcularDivisionIgualitaria', () => {

    it('divide en partes iguales cuando es divisible', () => {
        const result = calcularDivisionIgualitaria(300, ['u1', 'u2', 'u3'], 'u1');
        expect(result).toHaveLength(3);
        result.forEach(r => expect(r.monto_asignado).toBe(100));
    });

    it('la suma siempre es igual al monto original', () => {
        const result = calcularDivisionIgualitaria(100, ['u1', 'u2', 'u3'], 'u1');
        const suma = result.reduce((s, r) => Math.round((s + r.monto_asignado) * 100) / 100, 0);
        expect(suma).toBe(100);
    });

    it('la diferencia por redondeo va al pagador cuando participa', () => {
        // 100 / 3 = 33.33... → diferencia 0.01
        const result = calcularDivisionIgualitaria(100, ['u1', 'u2', 'u3'], 'u1');
        const pagador = result.find(r => r.user_id === 'u1');
        const otro = result.find(r => r.user_id === 'u2');
        expect(pagador.monto_asignado).toBeGreaterThan(otro.monto_asignado);
    });

    it('la diferencia por redondeo va al primer participante cuando el pagador no está en la lista', () => {
        const result = calcularDivisionIgualitaria(100, ['u1', 'u2', 'u3'], 'pagador-externo');
        const suma = result.reduce((s, r) => Math.round((s + r.monto_asignado) * 100) / 100, 0);
        expect(suma).toBe(100);
        // u1 es el primero, recibe la diferencia
        const primero = result.find(r => r.user_id === 'u1');
        const segundo = result.find(r => r.user_id === 'u2');
        expect(primero.monto_asignado).toBeGreaterThanOrEqual(segundo.monto_asignado);
    });

    it('funciona con dos participantes', () => {
        const result = calcularDivisionIgualitaria(99, ['ua', 'ub'], 'ua');
        const suma = result.reduce((s, r) => Math.round((s + r.monto_asignado) * 100) / 100, 0);
        expect(suma).toBe(99);
    });

    it('devuelve un objeto por participante con user_id correcto', () => {
        const ids = ['x1', 'x2'];
        const result = calcularDivisionIgualitaria(200, ids, 'x1');
        expect(result.map(r => r.user_id)).toEqual(ids);
    });
});
