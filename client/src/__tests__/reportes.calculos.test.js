/**
 * Tests para la lógica de estadísticas y reportes.
 * Extrae inline las funciones de agregación de getReporteByRango y getStats (db.js).
 * Sin dependencias de Supabase: solo lógica pura de cálculo.
 */

import { describe, it, expect } from 'vitest';

// ── Helpers replicados de db.js ───────────────────────────────────────────────

function calcularTotales(gastos) {
    const totalGastos     = gastos.reduce((s, g) => s + parseFloat(g.monto || 0), 0);
    const gastosFijos     = gastos.filter(g => g.es_fijo).reduce((s, g) => s + parseFloat(g.monto || 0), 0);
    const gastosVariables = totalGastos - gastosFijos;
    return { totalGastos, gastosFijos, gastosVariables };
}

function calcularPorCategoria(gastos) {
    const porCategoria = gastos.reduce((acc, g) => {
        const nombre = g.categorias?.nombre || 'Sin categoría';
        if (!acc[nombre]) acc[nombre] = { total: 0, cantidad: 0, porcentaje: 0 };
        acc[nombre].total    += parseFloat(g.monto || 0);
        acc[nombre].cantidad += 1;
        return acc;
    }, {});

    const totalGastos = gastos.reduce((s, g) => s + parseFloat(g.monto || 0), 0);
    Object.values(porCategoria).forEach(c => {
        c.porcentaje = totalGastos > 0 ? (c.total / totalGastos) * 100 : 0;
    });

    return porCategoria;
}

function calcularPorMetodoPago(gastos) {
    return gastos.reduce((acc, g) => {
        const nombre = g.metodos_pago?.nombre || 'Sin método';
        if (!acc[nombre]) acc[nombre] = { total: 0, cantidad: 0 };
        acc[nombre].total    += parseFloat(g.monto || 0);
        acc[nombre].cantidad += 1;
        return acc;
    }, {});
}

function calcularPorDia(gastos) {
    return gastos.reduce((acc, g) => {
        const fecha = (g.fecha || '').split('T')[0];
        if (!acc[fecha]) acc[fecha] = { total: 0, cantidad: 0 };
        acc[fecha].total    += parseFloat(g.monto || 0);
        acc[fecha].cantidad += 1;
        return acc;
    }, {});
}

function calcularSaldoDisponible(ingresoMensual, totalGastos) {
    return ingresoMensual - totalGastos;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const gastosFijos = [
    { id: 1, monto: '5000', es_fijo: true,  categorias: { nombre: 'Alquiler' }, metodos_pago: { nombre: 'Transferencia' }, fecha: '2026-05-01' },
    { id: 2, monto: '2000', es_fijo: true,  categorias: { nombre: 'Servicios' }, metodos_pago: { nombre: 'Débito' }, fecha: '2026-05-05' },
];

const gastosVariables = [
    { id: 3, monto: '1000', es_fijo: false, categorias: { nombre: 'Comida' }, metodos_pago: { nombre: 'Efectivo' }, fecha: '2026-05-10' },
    { id: 4, monto: '500',  es_fijo: false, categorias: { nombre: 'Comida' }, metodos_pago: { nombre: 'Efectivo' }, fecha: '2026-05-10' },
    { id: 5, monto: '300',  es_fijo: false, categorias: null,                  metodos_pago: null,                   fecha: '2026-05-15' },
];

const todosLosGastos = [...gastosFijos, ...gastosVariables];

// ── calcularTotales ───────────────────────────────────────────────────────────

describe('calcularTotales', () => {
    it('totalGastos es la suma de todos los montos', () => {
        const { totalGastos } = calcularTotales(todosLosGastos);
        expect(totalGastos).toBeCloseTo(8800);
    });

    it('gastosFijos suma solo los fijos', () => {
        const { gastosFijos } = calcularTotales(todosLosGastos);
        expect(gastosFijos).toBeCloseTo(7000);
    });

    it('gastosVariables es totalGastos - gastosFijos', () => {
        const { totalGastos, gastosFijos, gastosVariables } = calcularTotales(todosLosGastos);
        expect(Math.round(gastosVariables * 100)).toBe(Math.round((totalGastos - gastosFijos) * 100));
    });

    it('lista vacía → todo en 0', () => {
        const { totalGastos, gastosFijos, gastosVariables } = calcularTotales([]);
        expect(totalGastos).toBe(0);
        expect(gastosFijos).toBe(0);
        expect(gastosVariables).toBe(0);
    });

    it('todos fijos → gastosVariables === 0', () => {
        const { gastosVariables } = calcularTotales(gastosFijos);
        expect(gastosVariables).toBe(0);
    });

    it('todos variables → gastosFijos === 0', () => {
        const { gastosFijos } = calcularTotales(gastosVariables);
        expect(gastosFijos).toBe(0);
    });

    it('maneja monto como string numérico', () => {
        const gastos = [{ monto: '1500', es_fijo: false }];
        const { totalGastos } = calcularTotales(gastos);
        expect(totalGastos).toBe(1500);
    });

    it('maneja monto null o undefined como 0', () => {
        const gastos = [
            { monto: null,      es_fijo: false },
            { monto: undefined, es_fijo: false },
        ];
        const { totalGastos } = calcularTotales(gastos);
        expect(totalGastos).toBe(0);
    });
});

// ── calcularPorCategoria ──────────────────────────────────────────────────────

describe('calcularPorCategoria', () => {
    it('agrupa correctamente por nombre de categoría', () => {
        const resultado = calcularPorCategoria(todosLosGastos);
        expect(resultado['Comida']).toBeDefined();
        expect(resultado['Comida'].cantidad).toBe(2);
        expect(resultado['Comida'].total).toBeCloseTo(1500);
    });

    it('gasto sin categoría va a "Sin categoría"', () => {
        const resultado = calcularPorCategoria(todosLosGastos);
        expect(resultado['Sin categoría']).toBeDefined();
        expect(resultado['Sin categoría'].cantidad).toBe(1);
    });

    it('los porcentajes suman 100 (aproximado)', () => {
        const resultado = calcularPorCategoria(todosLosGastos);
        const sumaPct = Object.values(resultado).reduce((s, c) => s + c.porcentaje, 0);
        expect(sumaPct).toBeCloseTo(100, 1);
    });

    it('porcentaje es 0 si totalGastos es 0', () => {
        const gastos = [{ monto: '0', es_fijo: false, categorias: { nombre: 'Test' } }];
        const resultado = calcularPorCategoria(gastos);
        expect(resultado['Test'].porcentaje).toBe(0);
    });

    it('lista vacía → objeto vacío', () => {
        expect(calcularPorCategoria([])).toEqual({});
    });
});

// ── calcularPorMetodoPago ─────────────────────────────────────────────────────

describe('calcularPorMetodoPago', () => {
    it('agrupa correctamente por método de pago', () => {
        const resultado = calcularPorMetodoPago(todosLosGastos);
        expect(resultado['Efectivo']).toBeDefined();
        expect(resultado['Efectivo'].cantidad).toBe(2);
        expect(resultado['Efectivo'].total).toBeCloseTo(1500);
    });

    it('gasto sin método va a "Sin método"', () => {
        const resultado = calcularPorMetodoPago(todosLosGastos);
        expect(resultado['Sin método']).toBeDefined();
    });

    it('lista vacía → objeto vacío', () => {
        expect(calcularPorMetodoPago([])).toEqual({});
    });
});

// ── calcularPorDia ────────────────────────────────────────────────────────────

describe('calcularPorDia', () => {
    it('agrupa gastos del mismo día', () => {
        const resultado = calcularPorDia(todosLosGastos);
        expect(resultado['2026-05-10']).toBeDefined();
        expect(resultado['2026-05-10'].cantidad).toBe(2);
        expect(resultado['2026-05-10'].total).toBeCloseTo(1500);
    });

    it('fecha con timestamp se trunca a YYYY-MM-DD', () => {
        const gastos = [{ monto: '100', fecha: '2026-05-10T15:30:00Z' }];
        const resultado = calcularPorDia(gastos);
        expect(resultado['2026-05-10']).toBeDefined();
    });

    it('lista vacía → objeto vacío', () => {
        expect(calcularPorDia([])).toEqual({});
    });

    it('cada día tiene su propio total', () => {
        const resultado = calcularPorDia(todosLosGastos);
        expect(resultado['2026-05-01'].total).toBeCloseTo(5000);
        expect(resultado['2026-05-05'].total).toBeCloseTo(2000);
    });
});

// ── saldoDisponible ───────────────────────────────────────────────────────────

describe('calcularSaldoDisponible', () => {
    it('saldo positivo cuando ingreso > gastos', () => {
        expect(calcularSaldoDisponible(100000, 80000)).toBe(20000);
    });

    it('saldo negativo cuando gastos > ingreso', () => {
        expect(calcularSaldoDisponible(50000, 80000)).toBe(-30000);
    });

    it('saldo cero cuando ingreso === gastos', () => {
        expect(calcularSaldoDisponible(80000, 80000)).toBe(0);
    });

    it('saldo igual al ingreso cuando no hay gastos', () => {
        expect(calcularSaldoDisponible(100000, 0)).toBe(100000);
    });
});
