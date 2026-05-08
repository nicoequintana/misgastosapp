/**
 * Tests para lógica de visualización de saldos en SaldoTable.
 * Verifica la función obtenerEstado y la lógica de formateo.
 */

import { describe, it, expect } from 'vitest';

// Réplica de la lógica de SaldoTable
function obtenerEstado(saldoNeto, esMiUsuario) {
    if (saldoNeto > 0.01) {
        return {
            clase: 'saldo-table__estado--favor',
            texto: esMiUsuario ? 'Te deben' : 'Le deben',
        };
    }
    if (saldoNeto < -0.01) {
        return {
            clase: 'saldo-table__estado--deuda',
            texto: esMiUsuario ? 'Debés' : 'Debe',
        };
    }
    return { clase: 'saldo-table__estado--saldado', texto: 'Saldado' };
}

describe('SaldoTable — obtenerEstado', () => {
    it('saldo positivo de MI usuario → "Te deben"', () => {
        const { texto } = obtenerEstado(100, true);
        expect(texto).toBe('Te deben');
    });

    it('saldo positivo de OTRO usuario → "Le deben"', () => {
        const { texto } = obtenerEstado(100, false);
        expect(texto).toBe('Le deben');
    });

    it('saldo negativo de MI usuario → "Debés"', () => {
        const { texto } = obtenerEstado(-50, true);
        expect(texto).toBe('Debés');
    });

    it('saldo negativo de OTRO usuario → "Debe"', () => {
        const { texto } = obtenerEstado(-50, false);
        expect(texto).toBe('Debe');
    });

    it('saldo cero → "Saldado" siempre', () => {
        expect(obtenerEstado(0, true).texto).toBe('Saldado');
        expect(obtenerEstado(0, false).texto).toBe('Saldado');
    });

    it('saldo dentro del umbral de centavos (0.005) → "Saldado"', () => {
        expect(obtenerEstado(0.005, true).texto).toBe('Saldado');
        expect(obtenerEstado(-0.005, true).texto).toBe('Saldado');
    });

    it('saldo positivo retorna clase --favor', () => {
        expect(obtenerEstado(10, false).clase).toBe('saldo-table__estado--favor');
    });

    it('saldo negativo retorna clase --deuda', () => {
        expect(obtenerEstado(-10, false).clase).toBe('saldo-table__estado--deuda');
    });

    it('saldo cero retorna clase --saldado', () => {
        expect(obtenerEstado(0, false).clase).toBe('saldo-table__estado--saldado');
    });
});
