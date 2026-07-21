import { describe, it, expect } from 'vitest';
import { generarResumenSemanal } from './resumenSemanal';

describe('generarResumenSemanal', () => {

    it('retorna null si no hay stats', () => {
        expect(generarResumenSemanal(null)).toBeNull();
    });

    it('mensaje "no registraste gastos" cuando no hay movimientos en 7 días', () => {
        const result = generarResumenSemanal({ gastos: [] });
        expect(result.mensaje).toBe('No registraste gastos en los últimos 7 días.');
        expect(result.metadata.cantidad).toBe(0);
        expect(result.metadata.top_categorias).toBeNull();
    });

    it('ignora gastos fuera de la ventana de 7 días', () => {
        const stats = {
            gastos: [
                { fecha: '2020-01-01', monto: 999, categorias: { nombre: 'Viejo' } },
            ],
        };
        const result = generarResumenSemanal(stats);
        expect(result.metadata.cantidad).toBe(0);
    });

    it('suma total y arma top 3 categorías dentro de la ventana', () => {
        const hoy = new Date().toISOString().split('T')[0];
        const stats = {
            gastos: [
                { fecha: hoy, monto: 100, categorias: { nombre: 'Comida' } },
                { fecha: hoy, monto: 300, categorias: { nombre: 'Transporte' } },
                { fecha: hoy, monto: 50, categorias: null },
            ],
        };
        const result = generarResumenSemanal(stats);
        expect(result.metadata.cantidad).toBe(3);
        expect(result.metadata.total_semana).toBe(450);
        expect(result.metadata.top_categorias).toContain('Transporte: $300');
        expect(result.metadata.top_categorias).toContain('Sin categoría: $50');
    });
});
