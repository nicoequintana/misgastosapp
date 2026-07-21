import { describe, it, expect, vi } from 'vitest';
import { evaluarAlertasFinancieras } from './alertasFinancieras';

const configBase = {
    notificar_saldo_bajo: true,
    umbral_saldo_bajo: 5000,
    notificar_porcentaje_ingreso: true,
    porcentaje_maximo_ingreso: 80,
};
const puedeDisparaSiempre = () => true;

describe('evaluarAlertasFinancieras', () => {

    it('retorna [] si no hay stats', () => {
        expect(evaluarAlertasFinancieras(null, configBase, puedeDisparaSiempre)).toEqual([]);
    });

    it('dispara "ingreso no configurado" y corta las demás alertas (cortocircuito)', () => {
        const stats = { ingresoMensual: 0, saldoDisponible: 0, totalGastos: 0 };
        const result = evaluarAlertasFinancieras(stats, configBase, puedeDisparaSiempre);
        expect(result).toHaveLength(1);
        expect(result[0].titulo).toBe('Ingreso mensual no configurado');
        expect(result[0].origen).toBe('sistema');
    });

    it('no dispara "ingreso no configurado" si el throttle lo bloquea, y no hay otras alertas porque ingresoMensual sigue en 0', () => {
        const stats = { ingresoMensual: 0, saldoDisponible: 0, totalGastos: 0 };
        const result = evaluarAlertasFinancieras(stats, configBase, () => false);
        expect(result).toEqual([]);
    });

    it('dispara "saldo bajo" cuando el saldo está debajo del umbral', () => {
        const stats = { ingresoMensual: 10000, saldoDisponible: 1000, totalGastos: 500 };
        const result = evaluarAlertasFinancieras(stats, configBase, puedeDisparaSiempre);
        const saldoBajo = result.find(n => n.titulo === 'Saldo disponible bajo');
        expect(saldoBajo).toBeDefined();
        expect(saldoBajo.tipo).toBe('error');
        expect(saldoBajo.metadata.saldo_disponible).toBe(1000);
    });

    it('dispara "límite de gastos alcanzado" cuando se supera el porcentaje máximo', () => {
        const stats = { ingresoMensual: 1000, saldoDisponible: 9000, totalGastos: 900 };
        const result = evaluarAlertasFinancieras(stats, configBase, puedeDisparaSiempre);
        const limite = result.find(n => n.titulo === 'Límite de gastos alcanzado');
        expect(limite).toBeDefined();
        expect(limite.tipo).toBe('warning');
        expect(limite.metadata.porcentaje_usado).toBe(90);
    });

    it('puede disparar ambas alertas (saldo bajo y porcentaje) en la misma llamada', () => {
        const stats = { ingresoMensual: 1000, saldoDisponible: 100, totalGastos: 900 };
        const result = evaluarAlertasFinancieras(stats, configBase, puedeDisparaSiempre);
        expect(result).toHaveLength(2);
    });

    it('no dispara nada si las condiciones no se cumplen', () => {
        const stats = { ingresoMensual: 10000, saldoDisponible: 8000, totalGastos: 1000 };
        const result = evaluarAlertasFinancieras(stats, configBase, puedeDisparaSiempre);
        expect(result).toEqual([]);
    });

    it('consume el throttle de porcentaje_ingreso aunque no se supere el umbral (paridad con el original)', () => {
        const puedeDisparar = vi.fn(() => true);
        const stats = { ingresoMensual: 10000, saldoDisponible: 8000, totalGastos: 1000 };
        evaluarAlertasFinancieras(stats, configBase, puedeDisparar);
        expect(puedeDisparar).toHaveBeenCalledWith('porcentaje_ingreso');
    });

    it('no evalúa saldo_bajo ni porcentaje_ingreso si el throttle de cada una los bloquea', () => {
        const stats = { ingresoMensual: 1000, saldoDisponible: 100, totalGastos: 900 };
        const result = evaluarAlertasFinancieras(stats, configBase, () => false);
        expect(result).toEqual([]);
    });
});
