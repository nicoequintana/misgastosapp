import { describe, it, expect, vi } from 'vitest';
import { evaluarAlertaConcentracionCategoria } from './alertaConcentracionCategoria';

const configBase = { notificar_concentracion_categoria: true, porcentaje_concentracion_categoria: 40 };
const puedeDisparaSiempre = () => true;

describe('evaluarAlertaConcentracionCategoria', () => {

    it('no dispara si totalGastos es 0', () => {
        const result = evaluarAlertaConcentracionCategoria({ totalGastos: 0 }, configBase, puedeDisparaSiempre);
        expect(result).toEqual([]);
    });

    it('no dispara si la config está deshabilitada', () => {
        const stats = { totalGastos: 100, porCategoria: { Comida: { total: 100 } } };
        const result = evaluarAlertaConcentracionCategoria(stats, { ...configBase, notificar_concentracion_categoria: false }, puedeDisparaSiempre);
        expect(result).toEqual([]);
    });

    it('respeta el throttle: no dispara si puedeDisparar retorna false', () => {
        const stats = { totalGastos: 100, porCategoria: { Comida: { total: 100 } } };
        const result = evaluarAlertaConcentracionCategoria(stats, configBase, () => false);
        expect(result).toEqual([]);
    });

    it('dispara cuando una categoría supera el umbral configurado', () => {
        const stats = {
            totalGastos: 1000,
            porCategoria: {
                Comida: { total: 500 },
                Transporte: { total: 300 },
                Otros: { total: 200 },
            },
        };
        const result = evaluarAlertaConcentracionCategoria(stats, configBase, puedeDisparaSiempre);
        expect(result).toHaveLength(1);
        expect(result[0].metadata.categoria).toBe('Comida');
        expect(result[0].metadata.porcentaje).toBe(50);
        expect(result[0].tipo).toBe('info');
    });

    it('no dispara si ninguna categoría supera el umbral', () => {
        const stats = {
            totalGastos: 1000,
            porCategoria: { Comida: { total: 100 }, Transporte: { total: 100 } },
        };
        const result = evaluarAlertaConcentracionCategoria(stats, configBase, puedeDisparaSiempre);
        expect(result).toEqual([]);
    });

    it('llama a puedeDisparar con el tipo de alerta correcto', () => {
        const puedeDisparar = vi.fn(() => true);
        const stats = { totalGastos: 100, porCategoria: {} };
        evaluarAlertaConcentracionCategoria(stats, configBase, puedeDisparar);
        expect(puedeDisparar).toHaveBeenCalledWith('concentracion_categoria');
    });
});
