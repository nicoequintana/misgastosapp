import { describe, it, expect } from 'vitest';
import { generarResumenDiario } from './resumenDiario';
import { fechaHoyArgentina } from '../../utils/format';

describe('generarResumenDiario', () => {

    it('retorna null si no hay stats', () => {
        expect(generarResumenDiario(null)).toBeNull();
    });

    it('mensaje "no registraste gastos hoy" cuando no hay gastos del día', () => {
        const stats = { gastos: [] };
        const result = generarResumenDiario(stats);
        expect(result.mensaje).toBe('No registraste gastos hoy.');
        expect(result.tipo).toBe('info');
        expect(result.origen).toBe('resumen');
        expect(result.metadata.cantidad).toBe(0);
    });

    it('suma solo los gastos de hoy e ignora los de otros días', () => {
        const hoy = fechaHoyArgentina();
        const stats = {
            gastos: [
                { fecha: `${hoy}T10:00:00`, monto: 100 },
                { fecha: `${hoy}T15:00:00`, monto: 200 },
                { fecha: '2020-01-01T10:00:00', monto: 999 },
            ],
        };
        const result = generarResumenDiario(stats);
        expect(result.metadata.cantidad).toBe(2);
        expect(result.metadata.total_del_dia).toBe(300);
        expect(result.mensaje).toContain('Hoy registraste 2 gastos por un total de $300');
    });

    it('usa singular "gasto" cuando hay exactamente 1', () => {
        const hoy = fechaHoyArgentina();
        const stats = { gastos: [{ fecha: hoy, monto: 50 }] };
        const result = generarResumenDiario(stats);
        expect(result.mensaje).toContain('1 gasto por');
    });
});
