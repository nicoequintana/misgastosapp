import { describe, it, expect } from 'vitest';
import { evaluarAlertasGastosFijos } from './alertasGastosFijos';

const configBase = {
    notificar_gastos_fijos_exceso: true,
    umbral_fijos_ingreso: 60,
    notificar_gastos_fijos_pendientes: true,
    notificar_variables_crecimiento: true,
    margen_crecimiento_variables: 20,
};
const puedeDisparaSiempre = () => true;

describe('evaluarAlertasGastosFijos', () => {

    it('retorna [] si no hay stats o ingresoMensual es 0', () => {
        expect(evaluarAlertasGastosFijos(null, null, configBase, puedeDisparaSiempre)).toEqual([]);
        expect(evaluarAlertasGastosFijos({ ingresoMensual: 0 }, null, configBase, puedeDisparaSiempre)).toEqual([]);
    });

    it('dispara "gastos fijos elevados" cuando el % supera el umbral', () => {
        const stats = { ingresoMensual: 1000, gastosFijos: 700, gastos: [] };
        const result = evaluarAlertasGastosFijos(stats, null, configBase, puedeDisparaSiempre);
        const alerta = result.find(n => n.titulo === 'Gastos fijos elevados');
        expect(alerta).toBeDefined();
        expect(alerta.metadata.porcentaje_fijos).toBe(70);
    });

    it('no dispara "gastos fijos elevados" si no hay exceso', () => {
        const stats = { ingresoMensual: 1000, gastosFijos: 100, gastos: [] };
        const result = evaluarAlertasGastosFijos(stats, null, configBase, puedeDisparaSiempre);
        expect(result.find(n => n.titulo === 'Gastos fijos elevados')).toBeUndefined();
    });

    it('no evalúa "pendientes" ni "variables" si statsMesAnterior es null', () => {
        const stats = { ingresoMensual: 1000, gastosFijos: 100, gastosVariables: 100, gastos: [] };
        const result = evaluarAlertasGastosFijos(stats, null, configBase, puedeDisparaSiempre);
        expect(result.find(n => n.titulo === 'Gastos fijos pendientes')).toBeUndefined();
        expect(result.find(n => n.titulo === 'Gastos variables en aumento')).toBeUndefined();
    });

    it('dispara "gastos fijos pendientes" cuando bajaron los fijos respecto al mes anterior', () => {
        const stats = {
            ingresoMensual: 1000,
            gastosFijos: 100,
            gastosVariables: 100,
            gastos: [{ es_fijo: true }],
        };
        const statsMesAnterior = { gastosFijosLista: [{}, {}, {}], gastosVariables: 0 };
        const result = evaluarAlertasGastosFijos(stats, statsMesAnterior, configBase, puedeDisparaSiempre);
        const alerta = result.find(n => n.titulo === 'Gastos fijos pendientes');
        expect(alerta).toBeDefined();
        expect(alerta.metadata.fijos_mes_anterior).toBe(3);
        expect(alerta.metadata.fijos_mes_actual).toBe(1);
        expect(alerta.metadata.faltantes).toBe(2);
    });

    it('no dispara "pendientes" si los fijos actuales son iguales o más que el mes anterior', () => {
        const stats = { ingresoMensual: 1000, gastosFijos: 100, gastosVariables: 100, gastos: [{ es_fijo: true }, { es_fijo: true }] };
        const statsMesAnterior = { gastosFijosLista: [{}, {}], gastosVariables: 0 };
        const result = evaluarAlertasGastosFijos(stats, statsMesAnterior, configBase, puedeDisparaSiempre);
        expect(result.find(n => n.titulo === 'Gastos fijos pendientes')).toBeUndefined();
    });

    it('dispara "gastos variables en aumento" cuando el crecimiento supera el margen', () => {
        const stats = { ingresoMensual: 1000, gastosFijos: 100, gastosVariables: 200, gastos: [] };
        const statsMesAnterior = { gastosFijosLista: [], gastosVariables: 100 };
        const result = evaluarAlertasGastosFijos(stats, statsMesAnterior, configBase, puedeDisparaSiempre);
        const alerta = result.find(n => n.titulo === 'Gastos variables en aumento');
        expect(alerta).toBeDefined();
        expect(alerta.metadata.crecimiento_pct).toBe(100);
    });

    it('no dispara "variables" si statsMesAnterior.gastosVariables es 0', () => {
        const stats = { ingresoMensual: 1000, gastosFijos: 100, gastosVariables: 200, gastos: [] };
        const statsMesAnterior = { gastosFijosLista: [], gastosVariables: 0 };
        const result = evaluarAlertasGastosFijos(stats, statsMesAnterior, configBase, puedeDisparaSiempre);
        expect(result.find(n => n.titulo === 'Gastos variables en aumento')).toBeUndefined();
    });

    it('respeta el throttle independiente por cada tipo de alerta', () => {
        const stats = { ingresoMensual: 1000, gastosFijos: 700, gastosVariables: 200, gastos: [] };
        const statsMesAnterior = { gastosFijosLista: [{}], gastosVariables: 100 };
        // Bloquea solo "gastos_fijos_exceso"
        const puedeDisparar = (tipo) => tipo !== 'gastos_fijos_exceso';
        const result = evaluarAlertasGastosFijos(stats, statsMesAnterior, configBase, puedeDisparar);
        expect(result.find(n => n.titulo === 'Gastos fijos elevados')).toBeUndefined();
        expect(result.find(n => n.titulo === 'Gastos variables en aumento')).toBeDefined();
    });
});
