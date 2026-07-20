/**
 * Tests para calcularAgregadosGastos (R10 — consolida el cálculo de
 * total/fijos/variables que estaba triplicado en getStats, getReporteByRango
 * y getStatsByMonth).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

describe('calcularAgregadosGastos', () => {
    it('separa correctamente fijos y variables', async () => {
        const { calcularAgregadosGastos } = await import('./db.js');
        const gastos = [
            { monto: 1000, es_fijo: true },
            { monto: 500, es_fijo: false },
            { monto: 300, es_fijo: true },
        ];
        const resultado = calcularAgregadosGastos(gastos);
        expect(resultado.totalGastos).toBe(1800);
        expect(resultado.gastosFijos).toBe(1300);
        expect(resultado.gastosVariables).toBe(500);
    });

    it('retorna ceros con lista vacía', async () => {
        const { calcularAgregadosGastos } = await import('./db.js');
        const resultado = calcularAgregadosGastos([]);
        expect(resultado).toEqual({ totalGastos: 0, gastosFijos: 0, gastosVariables: 0 });
    });

    it('trata monto null/undefined como 0', async () => {
        const { calcularAgregadosGastos } = await import('./db.js');
        const gastos = [{ monto: null, es_fijo: false }, { monto: undefined, es_fijo: true }];
        const resultado = calcularAgregadosGastos(gastos);
        expect(resultado.totalGastos).toBe(0);
    });

    it('parsea monto que llega como string', async () => {
        const { calcularAgregadosGastos } = await import('./db.js');
        const gastos = [{ monto: '150.50', es_fijo: false }];
        const resultado = calcularAgregadosGastos(gastos);
        expect(resultado.totalGastos).toBe(150.50);
    });

    it('todos fijos: gastosVariables es 0', async () => {
        const { calcularAgregadosGastos } = await import('./db.js');
        const gastos = [{ monto: 100, es_fijo: true }, { monto: 200, es_fijo: true }];
        const resultado = calcularAgregadosGastos(gastos);
        expect(resultado.gastosVariables).toBe(0);
        expect(resultado.gastosFijos).toBe(300);
    });
});
