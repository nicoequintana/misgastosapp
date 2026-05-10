/**
 * Tests para client/src/utils/format.js
 * Funciones puras: sin dependencias externas, testeable sin mocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatCurrency, parseCurrency, fechaHoyArgentina } from '../utils/format';

// ── formatCurrency ────────────────────────────────────────────────────────────

describe('formatCurrency', () => {
    it('formatea número entero con 2 decimales', () => {
        expect(formatCurrency(1000)).toBe('1.000,00');
    });

    it('formatea número con decimales', () => {
        expect(formatCurrency(1500.5)).toBe('1.500,50');
    });

    it('formatea número pequeño', () => {
        expect(formatCurrency(10)).toBe('10,00');
    });

    it('formatea cero', () => {
        expect(formatCurrency(0)).toBe('0,00');
    });

    it('retorna string vacío para null', () => {
        expect(formatCurrency(null)).toBe('');
    });

    it('retorna string vacío para undefined', () => {
        expect(formatCurrency(undefined)).toBe('');
    });

    it('retorna string vacío para string vacío', () => {
        expect(formatCurrency('')).toBe('');
    });

    it('formatea string numérico igual que número', () => {
        expect(formatCurrency('1500.50')).toBe('1.500,50');
    });

    it('formatea número negativo', () => {
        expect(formatCurrency(-500)).toBe('-500,00');
    });

    it('no agrega símbolo de moneda (solo número formateado AR)', () => {
        const result = formatCurrency(1000);
        expect(result).not.toContain('$');
    });
});

// ── parseCurrency ─────────────────────────────────────────────────────────────

describe('parseCurrency', () => {
    it('parsea string de moneda argentino "1.234,56" → 1234.56', () => {
        expect(parseCurrency('1.234,56')).toBeCloseTo(1234.56);
    });

    it('parsea entero sin separadores', () => {
        expect(parseCurrency('1000')).toBe(1000);
    });

    it('parsea con coma decimal "1500,50" → 1500.5', () => {
        expect(parseCurrency('1500,50')).toBeCloseTo(1500.5);
    });

    it('retorna 0 para string vacío', () => {
        expect(parseCurrency('')).toBe(0);
    });

    it('retorna 0 para null', () => {
        expect(parseCurrency(null)).toBe(0);
    });

    it('retorna 0 para undefined', () => {
        expect(parseCurrency(undefined)).toBe(0);
    });

    it('es inverso de formatCurrency para números positivos', () => {
        const original = 1500.50;
        const formatted = formatCurrency(original);
        const parsed = parseCurrency(formatted);
        expect(parsed).toBeCloseTo(original, 2);
    });

    it('parsea millones "1.000.000,00" → 1000000', () => {
        expect(parseCurrency('1.000.000,00')).toBeCloseTo(1000000);
    });
});

// ── fechaHoyArgentina ─────────────────────────────────────────────────────────

describe('fechaHoyArgentina', () => {
    it('retorna string con formato YYYY-MM-DD', () => {
        const fecha = fechaHoyArgentina();
        expect(fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('el año está en rango razonable (2024-2030)', () => {
        const anio = parseInt(fechaHoyArgentina().split('-')[0]);
        expect(anio).toBeGreaterThanOrEqual(2024);
        expect(anio).toBeLessThanOrEqual(2030);
    });

    it('el mes está entre 01 y 12', () => {
        const mes = parseInt(fechaHoyArgentina().split('-')[1]);
        expect(mes).toBeGreaterThanOrEqual(1);
        expect(mes).toBeLessThanOrEqual(12);
    });

    it('el día está entre 01 y 31', () => {
        const dia = parseInt(fechaHoyArgentina().split('-')[2]);
        expect(dia).toBeGreaterThanOrEqual(1);
        expect(dia).toBeLessThanOrEqual(31);
    });

    it('retorna la fecha de hoy en zona Argentina (no UTC desfasada)', () => {
        // Simulamos medianoche UTC (00:00 UTC = 21:00 del día anterior en Argentina).
        // fechaHoyArgentina debe devolver el día ANTERIOR, no el día UTC.
        const fechaSistema = new Date('2026-05-11T02:30:00Z'); // 23:30 del 10/05 en AR
        vi.setSystemTime(fechaSistema);

        const fecha = fechaHoyArgentina();
        // toISOString() devolvería '2026-05-11' (UTC), pero Argentina está en UTC-3
        // así que a las 02:30 UTC son las 23:30 del 10/05 → debe retornar '2026-05-10'
        expect(fecha).toBe('2026-05-10');

        vi.useRealTimers();
    });
});