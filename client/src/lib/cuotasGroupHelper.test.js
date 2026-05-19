import { describe, it, expect } from 'vitest';
import {
    agruparPorPadre,
    filtrarTarjetaCredito,
    filtrarPrestamos,
    transformarGrupoCuotas,
    transformarGrupoCuotasFuturas,
} from './cuotasGroupHelper';

// ─────────────────────────────────────────────
// Factories de datos de prueba
// ─────────────────────────────────────────────

function mkCuota({ id, id_gasto_padre, numero_cuota, monto, fecha, descripcion = 'ITEM (1/3)', categoria = 'TARJETAS', metodo = 'TARJETA DE CREDITO' }) {
    return {
        id,
        id_gasto_padre,
        numero_cuota,
        monto,
        fecha,
        descripcion,
        categorias: { id: 10, nombre: categoria },
        metodos_pago: { id: 1, nombre: metodo },
    };
}

function mkPrestamo({ id, id_gasto_padre, numero_cuota, monto, fecha, descripcion = 'PRESTAMO (1/6)' }) {
    return mkCuota({ id, id_gasto_padre, numero_cuota, monto, fecha, descripcion, categoria: 'PRESTAMOS', metodo: 'TRANSFERENCIA' });
}

// ─────────────────────────────────────────────
// agruparPorPadre
// ─────────────────────────────────────────────

describe('agruparPorPadre', () => {

    it('agrupa correctamente dos compras distintas', () => {
        const rows = [
            mkCuota({ id: 1, id_gasto_padre: 100, numero_cuota: 1, monto: 500, fecha: '2025-01-01' }),
            mkCuota({ id: 2, id_gasto_padre: 100, numero_cuota: 2, monto: 500, fecha: '2025-02-01' }),
            mkCuota({ id: 3, id_gasto_padre: 200, numero_cuota: 1, monto: 300, fecha: '2025-01-01' }),
        ];
        const grupos = agruparPorPadre(rows);
        expect(Object.keys(grupos)).toHaveLength(2);
        expect(grupos[100]).toHaveLength(2);
        expect(grupos[200]).toHaveLength(1);
    });

    it('devuelve objeto vacío para array vacío', () => {
        expect(agruparPorPadre([])).toEqual({});
    });

    it('un solo registro forma un grupo de 1', () => {
        const rows = [mkCuota({ id: 1, id_gasto_padre: 99, numero_cuota: 1, monto: 100, fecha: '2025-01-01' })];
        const grupos = agruparPorPadre(rows);
        expect(grupos[99]).toHaveLength(1);
    });
});

// ─────────────────────────────────────────────
// filtrarTarjetaCredito
// ─────────────────────────────────────────────

describe('filtrarTarjetaCredito', () => {

    it('retiene solo las filas con método TARJETA DE CREDITO', () => {
        const rows = [
            mkCuota({ id: 1, id_gasto_padre: 1, numero_cuota: 1, monto: 100, fecha: '2025-01-01', metodo: 'TARJETA DE CREDITO' }),
            mkCuota({ id: 2, id_gasto_padre: 2, numero_cuota: 1, monto: 200, fecha: '2025-01-01', metodo: 'EFECTIVO' }),
            mkCuota({ id: 3, id_gasto_padre: 3, numero_cuota: 1, monto: 300, fecha: '2025-01-01', metodo: 'tarjeta de credito' }),
        ];
        const result = filtrarTarjetaCredito(rows);
        // Case-insensitive: id 1 y 3 pasan
        expect(result).toHaveLength(2);
        expect(result.map(r => r.id)).toEqual([1, 3]);
    });

    it('devuelve array vacío si ninguno coincide', () => {
        const rows = [
            mkCuota({ id: 1, id_gasto_padre: 1, numero_cuota: 1, monto: 100, fecha: '2025-01-01', metodo: 'DEBITO' }),
        ];
        expect(filtrarTarjetaCredito(rows)).toHaveLength(0);
    });

    it('no filtra filas con metodos_pago null', () => {
        const row = { id: 1, id_gasto_padre: 1, numero_cuota: 1, monto: 100, fecha: '2025-01-01', metodos_pago: null };
        expect(filtrarTarjetaCredito([row])).toHaveLength(0);
    });

    it('devuelve array vacío con input vacío', () => {
        expect(filtrarTarjetaCredito([])).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────
// filtrarPrestamos
// ─────────────────────────────────────────────

describe('filtrarPrestamos', () => {

    it('retiene solo las filas con categoría PRESTAMOS', () => {
        const rows = [
            mkPrestamo({ id: 1, id_gasto_padre: 1, numero_cuota: 1, monto: 100, fecha: '2025-01-01' }),
            mkCuota({ id: 2, id_gasto_padre: 2, numero_cuota: 1, monto: 200, fecha: '2025-01-01', categoria: 'COMIDA' }),
            mkPrestamo({ id: 3, id_gasto_padre: 3, numero_cuota: 1, monto: 300, fecha: '2025-01-01' }),
        ];
        const result = filtrarPrestamos(rows);
        expect(result).toHaveLength(2);
        expect(result.map(r => r.id)).toEqual([1, 3]);
    });

    it('es case-insensitive: acepta "prestamos" en minúsculas', () => {
        const row = { ...mkPrestamo({ id: 1, id_gasto_padre: 1, numero_cuota: 1, monto: 100, fecha: '2025-01-01' }) };
        row.categorias = { id: 5, nombre: 'prestamos' };
        expect(filtrarPrestamos([row])).toHaveLength(1);
    });

    it('no filtra filas con categorias null', () => {
        const row = { id: 1, id_gasto_padre: 1, numero_cuota: 1, monto: 100, fecha: '2025-01-01', categorias: null };
        expect(filtrarPrestamos([row])).toHaveLength(0);
    });

    it('no mezcla con resultados de filtrarTarjetaCredito', () => {
        const rows = [
            mkCuota({ id: 1, id_gasto_padre: 1, numero_cuota: 1, monto: 100, fecha: '2025-01-01' }),
            mkPrestamo({ id: 2, id_gasto_padre: 2, numero_cuota: 1, monto: 200, fecha: '2025-01-01' }),
        ];
        expect(filtrarPrestamos(rows)).toHaveLength(1);
        expect(filtrarTarjetaCredito(rows)).toHaveLength(1);
    });
});

// ─────────────────────────────────────────────
// transformarGrupoCuotas
// ─────────────────────────────────────────────

describe('transformarGrupoCuotas', () => {

    // Fechas fijas para tests deterministas
    const HOY = '2025-05-15';
    const MES_INICIO = '2025-05-01';
    const MES_FIN    = '2025-05-31';

    it('calcula correctamente pagadas y pendientes', () => {
        // Cuota 1: fecha pasada → pagada. Cuota 2: futura → pendiente.
        const cuotas = [
            mkCuota({ id: 1, id_gasto_padre: 10, numero_cuota: 1, monto: 500, fecha: '2025-04-01', descripcion: 'TELE (1/2)' }),
            mkCuota({ id: 2, id_gasto_padre: 10, numero_cuota: 2, monto: 500, fecha: '2025-06-01', descripcion: 'TELE (2/2)' }),
        ];
        const result = transformarGrupoCuotas(cuotas, HOY, MES_INICIO, MES_FIN);
        expect(result.pagadas).toBe(1);
        expect(result.pendientes).toBe(1);
    });

    it('extrae descripcionBase eliminando el sufijo (N/M)', () => {
        const cuotas = [
            mkCuota({ id: 1, id_gasto_padre: 10, numero_cuota: 1, monto: 300, fecha: '2025-05-01', descripcion: 'NOTEBOOK (1/3)' }),
        ];
        const result = transformarGrupoCuotas(cuotas, HOY, MES_INICIO, MES_FIN);
        expect(result.descripcionBase).toBe('NOTEBOOK');
    });

    it('totalOriginal es la suma de todos los montos', () => {
        const cuotas = [
            mkCuota({ id: 1, id_gasto_padre: 20, numero_cuota: 1, monto: 333.34, fecha: '2025-04-01', descripcion: 'PROD (1/3)' }),
            mkCuota({ id: 2, id_gasto_padre: 20, numero_cuota: 2, monto: 333.33, fecha: '2025-05-01', descripcion: 'PROD (2/3)' }),
            mkCuota({ id: 3, id_gasto_padre: 20, numero_cuota: 3, monto: 333.33, fecha: '2025-06-01', descripcion: 'PROD (3/3)' }),
        ];
        const result = transformarGrupoCuotas(cuotas, HOY, MES_INICIO, MES_FIN);
        expect(result.totalOriginal).toBe(1000);
    });

    it('montoMesCorriente suma solo las cuotas del mes en curso', () => {
        const cuotas = [
            mkCuota({ id: 1, id_gasto_padre: 30, numero_cuota: 1, monto: 200, fecha: '2025-04-01', descripcion: 'X (1/3)' }), // mes pasado
            mkCuota({ id: 2, id_gasto_padre: 30, numero_cuota: 2, monto: 200, fecha: '2025-05-01', descripcion: 'X (2/3)' }), // mes actual ✓
            mkCuota({ id: 3, id_gasto_padre: 30, numero_cuota: 3, monto: 200, fecha: '2025-06-01', descripcion: 'X (3/3)' }), // mes siguiente
        ];
        const result = transformarGrupoCuotas(cuotas, HOY, MES_INICIO, MES_FIN);
        expect(result.montoMesCorriente).toBe(200);
    });

    it('montoMesCorriente es 0 si no hay cuotas en el mes', () => {
        const cuotas = [
            mkCuota({ id: 1, id_gasto_padre: 40, numero_cuota: 1, monto: 500, fecha: '2025-03-01', descripcion: 'Y (1/2)' }),
            mkCuota({ id: 2, id_gasto_padre: 40, numero_cuota: 2, monto: 500, fecha: '2025-07-01', descripcion: 'Y (2/2)' }),
        ];
        const result = transformarGrupoCuotas(cuotas, HOY, MES_INICIO, MES_FIN);
        expect(result.montoMesCorriente).toBe(0);
    });

    it('ordena las cuotas por numero_cuota aunque lleguen desordenadas', () => {
        const cuotas = [
            mkCuota({ id: 2, id_gasto_padre: 50, numero_cuota: 2, monto: 100, fecha: '2025-06-01', descripcion: 'Z (2/3)' }),
            mkCuota({ id: 3, id_gasto_padre: 50, numero_cuota: 3, monto: 100, fecha: '2025-07-01', descripcion: 'Z (3/3)' }),
            mkCuota({ id: 1, id_gasto_padre: 50, numero_cuota: 1, monto: 100, fecha: '2025-05-01', descripcion: 'Z (1/3)' }),
        ];
        const result = transformarGrupoCuotas(cuotas, HOY, MES_INICIO, MES_FIN);
        expect(result.cuotasList[0].numero_cuota).toBe(1);
        expect(result.cuotasList[2].numero_cuota).toBe(3);
    });

    it('grupo completamente saldado tiene pendientes = 0', () => {
        const cuotas = [
            mkCuota({ id: 1, id_gasto_padre: 60, numero_cuota: 1, monto: 100, fecha: '2025-01-01', descripcion: 'V (1/2)' }),
            mkCuota({ id: 2, id_gasto_padre: 60, numero_cuota: 2, monto: 100, fecha: '2025-02-01', descripcion: 'V (2/2)' }),
        ];
        const result = transformarGrupoCuotas(cuotas, HOY, MES_INICIO, MES_FIN);
        expect(result.pendientes).toBe(0);
        expect(result.pagadas).toBe(2);
    });

    it('usa la categoría de la primera cuota', () => {
        const cuotas = [
            mkPrestamo({ id: 1, id_gasto_padre: 70, numero_cuota: 1, monto: 500, fecha: '2025-05-01', descripcion: 'PRESTAMO AUTO (1/2)' }),
            mkPrestamo({ id: 2, id_gasto_padre: 70, numero_cuota: 2, monto: 500, fecha: '2025-06-01', descripcion: 'PRESTAMO AUTO (2/2)' }),
        ];
        const result = transformarGrupoCuotas(cuotas, HOY, MES_INICIO, MES_FIN);
        expect(result.categoria).toBe('PRESTAMOS');
    });

    it('no muta el array original de cuotas', () => {
        const cuotas = [
            mkCuota({ id: 2, id_gasto_padre: 80, numero_cuota: 2, monto: 100, fecha: '2025-06-01', descripcion: 'W (2/2)' }),
            mkCuota({ id: 1, id_gasto_padre: 80, numero_cuota: 1, monto: 100, fecha: '2025-05-01', descripcion: 'W (1/2)' }),
        ];
        const copia = [...cuotas];
        transformarGrupoCuotas(cuotas, HOY, MES_INICIO, MES_FIN);
        // El array original debe mantenerse igual (el helper usa spread interno)
        expect(cuotas[0].numero_cuota).toBe(copia[0].numero_cuota);
    });
});

// ─────────────────────────────────────────────
// transformarGrupoCuotasFuturas
// ─────────────────────────────────────────────

describe('transformarGrupoCuotasFuturas', () => {

    const MES_SIG_INICIO = '2025-06-01';
    const MES_SIG_FIN    = '2025-06-31';

    it('calcula montoMesSiguiente sumando cuotas del mes siguiente', () => {
        const cuotas = [
            mkCuota({ id: 1, id_gasto_padre: 90, numero_cuota: 2, monto: 400, fecha: '2025-06-01', descripcion: 'SILLA (2/3)' }),
            mkCuota({ id: 2, id_gasto_padre: 90, numero_cuota: 3, monto: 400, fecha: '2025-07-01', descripcion: 'SILLA (3/3)' }),
        ];
        const result = transformarGrupoCuotasFuturas(cuotas, MES_SIG_INICIO, MES_SIG_FIN);
        expect(result.montoMesSiguiente).toBe(400);
    });

    it('montoMesSiguiente es 0 si ninguna cuota cae en el mes siguiente', () => {
        const cuotas = [
            mkCuota({ id: 1, id_gasto_padre: 95, numero_cuota: 2, monto: 300, fecha: '2025-07-01', descripcion: 'MESA (2/2)' }),
        ];
        const result = transformarGrupoCuotasFuturas(cuotas, MES_SIG_INICIO, MES_SIG_FIN);
        expect(result.montoMesSiguiente).toBe(0);
    });

    it('extrae descripcionBase correctamente', () => {
        const cuotas = [
            mkCuota({ id: 1, id_gasto_padre: 91, numero_cuota: 2, monto: 100, fecha: '2025-06-01', descripcion: 'MONITOR (2/4)' }),
        ];
        const result = transformarGrupoCuotasFuturas(cuotas, MES_SIG_INICIO, MES_SIG_FIN);
        expect(result.descripcionBase).toBe('MONITOR');
    });

    it('expone idCategoria de la primera cuota', () => {
        const cuotas = [
            mkPrestamo({ id: 1, id_gasto_padre: 92, numero_cuota: 3, monto: 200, fecha: '2025-06-01', descripcion: 'PRESTA (3/6)' }),
        ];
        const result = transformarGrupoCuotasFuturas(cuotas, MES_SIG_INICIO, MES_SIG_FIN);
        expect(result.idCategoria).toBe(10);
    });

    it('ordena cuotasFuturas por numero_cuota', () => {
        const cuotas = [
            mkCuota({ id: 3, id_gasto_padre: 93, numero_cuota: 3, monto: 100, fecha: '2025-08-01', descripcion: 'A (3/3)' }),
            mkCuota({ id: 2, id_gasto_padre: 93, numero_cuota: 2, monto: 100, fecha: '2025-06-01', descripcion: 'A (2/3)' }),
        ];
        const result = transformarGrupoCuotasFuturas(cuotas, MES_SIG_INICIO, MES_SIG_FIN);
        expect(result.cuotasFuturas[0].numero_cuota).toBe(2);
        expect(result.cuotasFuturas[1].numero_cuota).toBe(3);
    });
});

// ─────────────────────────────────────────────
// Integración: flujo completo tarjeta vs préstamos
// ─────────────────────────────────────────────

describe('flujo completo: filtrar + agrupar + transformar', () => {

    const HOY        = '2025-05-15';
    const MES_INICIO = '2025-05-01';
    const MES_FIN    = '2025-05-31';

    it('tarjeta y préstamo en el mismo array se separan correctamente', () => {
        const rows = [
            // Compra con tarjeta: 2 cuotas. Cuota 1 pasada, cuota 2 futura (después de HOY 2025-05-15)
            mkCuota({ id: 1, id_gasto_padre: 100, numero_cuota: 1, monto: 500, fecha: '2025-04-01', descripcion: 'TV (1/2)' }),
            mkCuota({ id: 2, id_gasto_padre: 100, numero_cuota: 2, monto: 500, fecha: '2025-06-01', descripcion: 'TV (2/2)' }),
            // Préstamo: 2 cuotas. Cuota 1 pasada, cuota 2 futura
            mkPrestamo({ id: 3, id_gasto_padre: 200, numero_cuota: 1, monto: 300, fecha: '2025-04-01', descripcion: 'PRESTA MOTO (1/2)' }),
            mkPrestamo({ id: 4, id_gasto_padre: 200, numero_cuota: 2, monto: 300, fecha: '2025-07-01', descripcion: 'PRESTA MOTO (2/2)' }),
        ];

        const gruposTarjeta   = agruparPorPadre(filtrarTarjetaCredito(rows));
        const gruposPrestamos = agruparPorPadre(filtrarPrestamos(rows));

        expect(Object.keys(gruposTarjeta)).toHaveLength(1);
        expect(Object.keys(gruposPrestamos)).toHaveLength(1);

        const tarjeta  = transformarGrupoCuotas(Object.values(gruposTarjeta)[0],   HOY, MES_INICIO, MES_FIN);
        const prestamo = transformarGrupoCuotas(Object.values(gruposPrestamos)[0], HOY, MES_INICIO, MES_FIN);

        expect(tarjeta.descripcionBase).toBe('TV');
        expect(prestamo.descripcionBase).toBe('PRESTA MOTO');

        expect(tarjeta.categoria).toBe('TARJETAS');
        expect(prestamo.categoria).toBe('PRESTAMOS');

        // TV: cuota 1 ya pasó → 1 pagada, 1 pendiente
        expect(tarjeta.pagadas).toBe(1);
        expect(tarjeta.pendientes).toBe(1);

        // Préstamo: cuota 1 ya pasó → 1 pagada, 1 pendiente
        expect(prestamo.pagadas).toBe(1);
        expect(prestamo.pendientes).toBe(1);

        // Ninguna cuota de TV ni préstamo cae en mayo con las nuevas fechas
        expect(tarjeta.montoMesCorriente).toBe(0);
        expect(prestamo.montoMesCorriente).toBe(0);
    });
});
