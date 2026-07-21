import { describe, it, expect } from 'vitest';
import { generarResumenMensual } from './resumenMensual';

describe('generarResumenMensual', () => {

    it('retorna null si no hay stats', () => {
        expect(generarResumenMensual(null)).toBeNull();
    });

    it('calcula totales y pct de fijos cuando hay ingreso mensual', () => {
        const stats = {
            totalGastos: 1000,
            gastosFijos: 400,
            gastosVariables: 600,
            saldoDisponible: 2000,
            ingresoMensual: 4000,
            porCategoria: {
                Comida: { total: 300 },
                Transporte: { total: 200 },
            },
        };
        const result = generarResumenMensual(stats);
        expect(result.metadata.pct_fijos).toBe('10.0');
        expect(result.metadata.total_gastos).toBe(1000);
        expect(result.mensaje).toContain('Total gastado: $1.000');
        expect(result.metadata.top_categorias).toContain('Comida: $300');
        expect(result.tipo).toBe('info');
        expect(result.origen).toBe('resumen');
    });

    it('pct_fijos es "—" cuando no hay ingreso mensual configurado', () => {
        const stats = {
            totalGastos: 500,
            gastosFijos: 100,
            gastosVariables: 400,
            saldoDisponible: 0,
            ingresoMensual: 0,
            porCategoria: {},
        };
        const result = generarResumenMensual(stats);
        expect(result.metadata.pct_fijos).toBe('—');
        expect(result.metadata.top_categorias).toBeNull();
    });

    it('el título capitaliza el nombre del mes', () => {
        const stats = {
            totalGastos: 0, gastosFijos: 0, gastosVariables: 0,
            saldoDisponible: 0, ingresoMensual: 0, porCategoria: {},
        };
        const result = generarResumenMensual(stats);
        expect(result.titulo).toMatch(/^Resumen del mes — [A-ZÁÉÍÓÚ]/);
    });
});
