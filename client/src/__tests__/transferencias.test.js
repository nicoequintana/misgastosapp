/**
 * Tests para el algoritmo greedy de transferencias mínimas.
 * Cubre: grupos de 2, grupos de 3, grupos sin deudas, saldos por centavos.
 */

import { describe, it, expect } from 'vitest';
import { calcularTransferencias } from '../lib/grupos/saldos.js';

describe('calcularTransferencias', () => {
    it('retorna [] cuando no hay saldos', () => {
        expect(calcularTransferencias([])).toEqual([]);
        expect(calcularTransferencias(null)).toEqual([]);
    });

    it('retorna [] cuando todos los saldos son cero', () => {
        const saldos = [
            { user_id: 'A', saldo_neto: 0 },
            { user_id: 'B', saldo_neto: 0 },
        ];
        expect(calcularTransferencias(saldos)).toEqual([]);
    });

    it('dos personas: A le debe a B → 1 transferencia', () => {
        const saldos = [
            { user_id: 'A', saldo_neto: -50 },
            { user_id: 'B', saldo_neto: 50 },
        ];
        const result = calcularTransferencias(saldos);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ de: 'A', para: 'B', monto: 50 });
    });

    it('tres personas: minimiza a 2 transferencias', () => {
        // A pagó todo, B y C deben pagar su parte
        const saldos = [
            { user_id: 'A', saldo_neto: 200 },
            { user_id: 'B', saldo_neto: -100 },
            { user_id: 'C', saldo_neto: -100 },
        ];
        const result = calcularTransferencias(saldos);
        expect(result).toHaveLength(2);
        const totalTransferido = result.reduce((s, t) => s + t.monto, 0);
        expect(Math.round(totalTransferido)).toBe(200);
    });

    it('cuatro personas: deuda cruzada se resuelve en N-1 transferencias máximo', () => {
        const saldos = [
            { user_id: 'A', saldo_neto: 150 },
            { user_id: 'B', saldo_neto: 50 },
            { user_id: 'C', saldo_neto: -100 },
            { user_id: 'D', saldo_neto: -100 },
        ];
        const result = calcularTransferencias(saldos);
        // máximo 3 transferencias para 4 personas
        expect(result.length).toBeLessThanOrEqual(3);
        // todos los acreedores quedan saldados
        const cobradoPorA = result.filter(t => t.para === 'A').reduce((s, t) => s + t.monto, 0);
        const cobradoPorB = result.filter(t => t.para === 'B').reduce((s, t) => s + t.monto, 0);
        expect(Math.round(cobradoPorA)).toBe(150);
        expect(Math.round(cobradoPorB)).toBe(50);
    });

    it('ignora diferencias menores a 0.01 (umbral de centavos)', () => {
        const saldos = [
            { user_id: 'A', saldo_neto: 0.005 },
            { user_id: 'B', saldo_neto: -0.005 },
        ];
        expect(calcularTransferencias(saldos)).toEqual([]);
    });

    it('los montos de las transferencias suman el total de deudas', () => {
        const saldos = [
            { user_id: 'A', saldo_neto: 300 },
            { user_id: 'B', saldo_neto: -120 },
            { user_id: 'C', saldo_neto: -80 },
            { user_id: 'D', saldo_neto: -100 },
        ];
        const result = calcularTransferencias(saldos);
        const total = result.reduce((s, t) => s + t.monto, 0);
        expect(Math.round(total)).toBe(300);
    });

    it('cada transferencia tiene de, para y monto > 0', () => {
        const saldos = [
            { user_id: 'X', saldo_neto: 60 },
            { user_id: 'Y', saldo_neto: -30 },
            { user_id: 'Z', saldo_neto: -30 },
        ];
        calcularTransferencias(saldos).forEach((t) => {
            expect(t.de).toBeDefined();
            expect(t.para).toBeDefined();
            expect(t.monto).toBeGreaterThan(0);
            expect(t.de).not.toBe(t.para);
        });
    });
});
