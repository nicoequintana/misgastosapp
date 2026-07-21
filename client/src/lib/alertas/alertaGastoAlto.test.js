import { describe, it, expect } from 'vitest';
import { evaluarAlertaGastoAlto } from './alertaGastoAlto';

const configBase = { notificar_gasto_alto: true, monto_gasto_alto: 10000 };

describe('evaluarAlertaGastoAlto', () => {

    it('no dispara si la config tiene la alerta deshabilitada', () => {
        const result = evaluarAlertaGastoAlto({ monto: 999999 }, { ...configBase, notificar_gasto_alto: false });
        expect(result).toEqual([]);
    });

    it('no dispara si el monto está por debajo del umbral', () => {
        const result = evaluarAlertaGastoAlto({ monto: 5000, descripcion: 'SUPER' }, configBase);
        expect(result).toEqual([]);
    });

    it('dispara cuando el monto es igual o mayor al umbral', () => {
        const result = evaluarAlertaGastoAlto({ monto: 10000, descripcion: 'ALQUILER' }, configBase);
        expect(result).toHaveLength(1);
        expect(result[0].tipo).toBe('warning');
        expect(result[0].origen).toBe('alertas_financieras');
        expect(result[0].mensaje).toContain('ALQUILER');
        expect(result[0].mensaje).toContain('$10.000');
    });

    it('no usa throttle: siempre dispara si supera el umbral', () => {
        const r1 = evaluarAlertaGastoAlto({ monto: 20000, descripcion: 'A' }, configBase);
        const r2 = evaluarAlertaGastoAlto({ monto: 20000, descripcion: 'A' }, configBase);
        expect(r1).toHaveLength(1);
        expect(r2).toHaveLength(1);
    });
});
