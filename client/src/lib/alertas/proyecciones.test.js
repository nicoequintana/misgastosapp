import { describe, it, expect, vi, afterEach } from 'vitest';
import { calcularProyecciones } from './proyecciones';

const configBase = {
    notificar_proyecciones: true,
    objetivo_ahorro_porcentaje: 10,
};
const puedeDisparaSiempre = () => true;

describe('calcularProyecciones', () => {

    afterEach(() => {
        vi.useRealTimers();
    });

    it('retorna notificaciones [] y datos null si no hay stats o ingresoMensual es 0', () => {
        expect(calcularProyecciones(null, configBase, puedeDisparaSiempre)).toEqual({ notificaciones: [], datos: null });
        expect(calcularProyecciones({ ingresoMensual: 0 }, configBase, puedeDisparaSiempre))
            .toEqual({ notificaciones: [], datos: null });
    });

    it('retorna datos null si es el último día del mes (diasRestantes <= 0)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 31)); // 31 de enero
        const stats = { ingresoMensual: 1000, totalGastos: 500, saldoDisponible: 500 };
        const result = calcularProyecciones(stats, configBase, puedeDisparaSiempre);
        expect(result.datos).toBeNull();
    });

    it('calcula datos de proyección siempre, incluso con notificar_proyecciones desactivado', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 10)); // 10 de enero, 31 días en el mes -> 21 restantes
        const stats = { ingresoMensual: 3100, totalGastos: 1000, saldoDisponible: 2100 };
        const result = calcularProyecciones(stats, { ...configBase, notificar_proyecciones: false }, puedeDisparaSiempre);
        expect(result.datos).not.toBeNull();
        expect(result.datos.diasRestantes).toBe(21);
        expect(result.datos.gastoDiarioDisponible).toBeCloseTo(2100 / 21);
        expect(result.notificaciones).toEqual([]);
    });

    it('dispara "proyección de saldo negativo" cuando el gasto proyectado supera el ingreso', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 10));
        // gastoDiarioPromedio = 1000/10 = 100; gastoProyectado = 100*31 = 3100 > ingresoMensual 1000
        const stats = { ingresoMensual: 1000, totalGastos: 1000, saldoDisponible: 0 };
        const result = calcularProyecciones(stats, configBase, puedeDisparaSiempre);
        const alerta = result.notificaciones.find(n => n.titulo === 'Proyección de saldo negativo');
        expect(alerta).toBeDefined();
        expect(alerta.tipo).toBe('error');
    });

    it('no dispara alertas si notificar_proyecciones está desactivado', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 10));
        const stats = { ingresoMensual: 1000, totalGastos: 1000, saldoDisponible: 0 };
        const result = calcularProyecciones(stats, { ...configBase, notificar_proyecciones: false }, puedeDisparaSiempre);
        expect(result.notificaciones).toEqual([]);
    });

    it('dispara "objetivo de ahorro en riesgo" cuando el ahorro proyectado es menor al objetivo', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 10));
        // ingresoMensual=10000, gastoProyectado = (500/10)*31 = 1550, ahorroProyectado=8450
        // objetivoAhorro = 10% de 10000 = 1000 -> 8450 no es menor a 1000, ajustamos para forzar el caso
        const stats = { ingresoMensual: 1000, totalGastos: 500, saldoDisponible: 500 };
        // gastoDiarioPromedio=50, gastoProyectado=50*31=1550, ahorroProyectado=1000-1550=-550 < objetivoAhorro(100)
        const result = calcularProyecciones(stats, configBase, puedeDisparaSiempre);
        const alerta = result.notificaciones.find(n => n.titulo === 'Objetivo de ahorro en riesgo');
        expect(alerta).toBeDefined();
        expect(alerta.tipo).toBe('warning');
        expect(alerta.metadata.ahorro_proyectado).toBe(0); // Math.max(0, negativo)
    });

    it('respeta el throttle independiente para cada alerta de proyección', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 10));
        const stats = { ingresoMensual: 1000, totalGastos: 1000, saldoDisponible: 0 };
        const puedeDisparar = (tipo) => tipo !== 'proyeccion_saldo_negativo';
        const result = calcularProyecciones(stats, configBase, puedeDisparar);
        expect(result.notificaciones.find(n => n.titulo === 'Proyección de saldo negativo')).toBeUndefined();
    });
});
