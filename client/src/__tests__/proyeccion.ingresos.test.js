/**
 * Tests para la lógica de proyección de ingresos recurrentes.
 * Extrae inline el filtro de getProjectedIncomeByMonth (db.js líneas 973-985)
 * y el cálculo de totalCombinado (línea 995).
 */

import { describe, it, expect } from 'vitest';

// Réplica de la lógica de filtrado de recurrentes (db.js → getProjectedIncomeByMonth)
function filtrarRecurrentes(recurrentes, year, month) {
    const mesStr     = String(month).padStart(2, '0');
    const periodoStr = `${year}-${mesStr}-01`;
    const mesSigNum  = month === 12 ? 1 : month + 1;
    const anioSig    = month === 12 ? year + 1 : year;
    const hasta      = `${anioSig}-${String(mesSigNum).padStart(2, '0')}-01`;

    return recurrentes.filter(r => {
        if (!r.activo) return false;
        if (r.fecha_inicio > hasta) return false;
        if (r.fecha_fin && r.fecha_fin < periodoStr) return false;
        return true;
    });
}

// Réplica de totalCombinado
function calcularTotalCombinado(totalProyectado, totalReal) {
    return totalReal + Math.max(0, totalProyectado - totalReal);
}

// ── filtrarRecurrentes ────────────────────────────────────────────────────────

describe('filtrarRecurrentes', () => {
    const base = {
        id: 1,
        descripcion: 'SUELDO',
        monto: 100000,
        activo: true,
        fecha_inicio: '2026-01-01',
        fecha_fin: null,
    };

    it('incluye recurrente activo sin fecha_fin', () => {
        const resultado = filtrarRecurrentes([base], 2026, 5);
        expect(resultado).toHaveLength(1);
    });

    it('excluye recurrentes inactivos (activo: false)', () => {
        const resultado = filtrarRecurrentes([{ ...base, activo: false }], 2026, 5);
        expect(resultado).toHaveLength(0);
    });

    it('excluye recurrente que aún no empezó (fecha_inicio > hasta del período)', () => {
        const resultado = filtrarRecurrentes([{ ...base, fecha_inicio: '2026-07-01' }], 2026, 5);
        expect(resultado).toHaveLength(0);
    });

    it('incluye recurrente cuya fecha_inicio es exactamente el mes consultado', () => {
        const resultado = filtrarRecurrentes([{ ...base, fecha_inicio: '2026-05-01' }], 2026, 5);
        expect(resultado).toHaveLength(1);
    });

    it('excluye recurrente cuya fecha_fin es anterior al período', () => {
        const resultado = filtrarRecurrentes([{ ...base, fecha_fin: '2026-04-30' }], 2026, 5);
        expect(resultado).toHaveLength(0);
    });

    it('incluye recurrente cuya fecha_fin es en el mismo mes consultado', () => {
        const resultado = filtrarRecurrentes([{ ...base, fecha_fin: '2026-05-15' }], 2026, 5);
        expect(resultado).toHaveLength(1);
    });

    it('excluye recurrentes cuya fecha_fin es exactamente el primer día del período (ya terminó)', () => {
        // fecha_fin < periodoStr (2026-05-01) — si fecha_fin === '2026-05-01' NO excluye (no es menor)
        const resultado = filtrarRecurrentes([{ ...base, fecha_fin: '2026-04-01' }], 2026, 5);
        expect(resultado).toHaveLength(0);
    });

    it('filtra correctamente en diciembre (mes 12 → siguiente es enero del año siguiente)', () => {
        const resultado = filtrarRecurrentes([{ ...base, fecha_inicio: '2026-01-01' }], 2026, 12);
        expect(resultado).toHaveLength(1);
    });

    it('excluye en diciembre recurrente que empieza en enero siguiente', () => {
        // hasta = '2027-01-01', fecha_inicio = '2027-01-01' no es > hasta → se incluye
        // fecha_inicio = '2027-02-01' > hasta → se excluye
        const resultado = filtrarRecurrentes([{ ...base, fecha_inicio: '2027-02-01' }], 2026, 12);
        expect(resultado).toHaveLength(0);
    });

    it('retorna vacío si no hay recurrentes', () => {
        expect(filtrarRecurrentes([], 2026, 5)).toHaveLength(0);
    });

    it('filtra múltiples correctamente: uno incluido, uno excluido', () => {
        const recurrentes = [
            { ...base, id: 1, activo: true },
            { ...base, id: 2, activo: false },
        ];
        const resultado = filtrarRecurrentes(recurrentes, 2026, 5);
        expect(resultado).toHaveLength(1);
        expect(resultado[0].id).toBe(1);
    });
});

// ── calcularTotalCombinado ────────────────────────────────────────────────────

describe('calcularTotalCombinado', () => {
    it('cuando real < proyectado: combina real + diferencia proyectada', () => {
        // Real 30000, proyectado 100000 → combinado = 30000 + 70000 = 100000
        expect(calcularTotalCombinado(100000, 30000)).toBe(100000);
    });

    it('cuando real === proyectado: combinado = real (no duplica)', () => {
        expect(calcularTotalCombinado(100000, 100000)).toBe(100000);
    });

    it('cuando real > proyectado: combinado = real (no resta)', () => {
        // El usuario cobró más de lo proyectado → no se descuenta
        expect(calcularTotalCombinado(80000, 100000)).toBe(100000);
    });

    it('proyectado 0 y real 0 → combinado 0', () => {
        expect(calcularTotalCombinado(0, 0)).toBe(0);
    });

    it('proyectado 0 y real > 0 → combinado = real', () => {
        expect(calcularTotalCombinado(0, 50000)).toBe(50000);
    });
});