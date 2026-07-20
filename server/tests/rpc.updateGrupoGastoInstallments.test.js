/**
 * Tests para update_grupo_gasto_installments (tercer hallazgo de atomicidad
 * encontrado durante R4/R5, en el endpoint PUT /gastos/:gastoId de grupos).
 * server/db/migrations/20260722_rpc_update_grupo_gasto_installments.sql
 *
 * v2: el formulario de editar mostraba/permitía cambiar solo el monto de UNA
 * cuota puntual (cada fila de grupo_gastos guarda su porción), no el total real
 * de la compra ni la cantidad de cuotas. Ahora p_monto es el TOTAL y p_cuotas la
 * cantidad deseada — el RPC recrea las cuotas hijas si cambia cualquiera de los dos.
 *
 * El RPC vive en PL/pgSQL — estos tests replican en JS su lógica de:
 * (a) normalización de fecha de cuotas (mismo contrato que los otros 2 RPCs)
 * (b) recálculo de fechas de cuotas hermanas por offset de mes
 * (c) división de participantes (misma fórmula que create_grupo_gasto_installments)
 * (d) redistribución del TOTAL entre la nueva cantidad de cuotas
 */

const FORMATO_FECHA_REGEX = /^\d{4}-\d{2}(-\d{2})?$/;

function normalizarPrimeraCuota(input) {
    if (!FORMATO_FECHA_REGEX.test(input)) {
        throw new Error('Formato de fecha inválido, se espera YYYY-MM');
    }
    return `${input.slice(0, 7)}-01`;
}

// recalcularFechaCuota — misma lógica que el loop del RPC:
// v_fecha_cuota := v_fecha_primera + (mesOffset * INTERVAL '1 month')
function recalcularFechaCuota(fechaPrimeraCuota, numeroCuota) {
    const [anio, mes] = fechaPrimeraCuota.split('-').map(Number);
    const mesOffset = numeroCuota - 1;
    const mesTotal = (mes - 1) + mesOffset;
    const anioFinal = anio + Math.floor(mesTotal / 12);
    const mesFinal = (mesTotal % 12) + 1;
    return `${anioFinal}-${String(mesFinal).padStart(2, '0')}-01`;
}

function dividirEntreParticipantes(monto, participantes, pagadoPor) {
    const n = participantes.length;
    const base = Math.floor((monto / n) * 100) / 100;
    const diferencia = Math.round((monto - base * n) * 100) / 100;
    const idxPagador = participantes.indexOf(pagadoPor) !== -1
        ? participantes.indexOf(pagadoPor)
        : 0;

    return participantes.map((userId, idx) => ({
        user_id: userId,
        monto_asignado: idx === idxPagador
            ? Math.round((base + diferencia) * 100) / 100
            : base,
    }));
}

describe('update_grupo_gasto_installments — normalización de fecha', () => {
    it('acepta YYYY-MM y normaliza al día 1', () => {
        expect(normalizarPrimeraCuota('2026-08')).toBe('2026-08-01');
    });

    it('rechaza formato inválido', () => {
        expect(() => normalizarPrimeraCuota('agosto')).toThrow(/formato de fecha/i);
    });
});

describe('update_grupo_gasto_installments — recálculo de fechas de cuotas hermanas', () => {
    it('la cuota 1 queda en el mes elegido', () => {
        expect(recalcularFechaCuota('2026-08-01', 1)).toBe('2026-08-01');
    });

    it('cada cuota siguiente desplaza 1 mes calendario', () => {
        expect(recalcularFechaCuota('2026-08-01', 2)).toBe('2026-09-01');
        expect(recalcularFechaCuota('2026-08-01', 3)).toBe('2026-10-01');
    });

    it('desborda correctamente el año al cruzar diciembre', () => {
        expect(recalcularFechaCuota('2026-11-01', 3)).toBe('2027-01-01');
    });

    it('produce fechas consecutivas para las 18 cuotas máximas sin saltos', () => {
        const fechas = Array.from({ length: 18 }, (_, i) => recalcularFechaCuota('2026-01-01', i + 1));
        for (let i = 1; i < fechas.length; i++) {
            const [, mesPrev] = fechas[i - 1].split('-').map(Number);
            const [, mesActual] = fechas[i].split('-').map(Number);
            const saltoEsperado = mesPrev === 12 ? 1 : mesPrev + 1;
            expect(mesActual).toBe(saltoEsperado);
        }
    });
});

// redistribuirTotalEntreCuotas — misma lógica que el bloque
// v_monto_por_cuota/v_diferencia del RPC para el nuevo p_monto/p_cuotas.
function redistribuirTotalEntreCuotas(montoTotal, cantCuotas) {
    const cuotas = Math.max(1, Math.min(18, cantCuotas));
    const montoPorCuota = Math.floor((montoTotal / cuotas) * 100) / 100;
    const diferencia = Math.round((montoTotal - montoPorCuota * cuotas) * 100) / 100;

    return Array.from({ length: cuotas }, (_, i) => ({
        numero: i + 1,
        monto: i === 0 ? Math.round((montoPorCuota + diferencia) * 100) / 100 : montoPorCuota,
    }));
}

describe('update_grupo_gasto_installments — redistribución del total al cambiar monto/cantidad', () => {
    it('la suma de las cuotas recalculadas iguala el nuevo total exacto', () => {
        const casos = [
            [300000, 3],
            [500000, 6],
            [100, 3],
            [999.99, 4],
        ];
        casos.forEach(([total, n]) => {
            const cuotas = redistribuirTotalEntreCuotas(total, n);
            const suma = cuotas.reduce((s, c) => s + c.monto, 0);
            expect(Math.round(suma * 100)).toBe(Math.round(total * 100));
        });
    });

    it('genera exactamente la nueva cantidad de cuotas pedida (más que antes)', () => {
        const cuotas = redistribuirTotalEntreCuotas(600000, 6);
        expect(cuotas).toHaveLength(6);
    });

    it('genera exactamente la nueva cantidad de cuotas pedida (menos que antes)', () => {
        const cuotas = redistribuirTotalEntreCuotas(200000, 2);
        expect(cuotas).toHaveLength(2);
    });

    it('la cuota 1 absorbe la diferencia de redondeo', () => {
        const cuotas = redistribuirTotalEntreCuotas(100, 3);
        expect(cuotas[0].monto).toBeGreaterThanOrEqual(cuotas[1].monto);
        expect(cuotas[1].monto).toBe(cuotas[2].monto);
    });
});

describe('update_grupo_gasto_installments — división de participantes tras editar', () => {
    it('la suma de montos asignados iguala el nuevo monto del gasto', () => {
        const filas = dividirEntreParticipantes(150000, ['a', 'b', 'c'], 'a');
        const suma = filas.reduce((s, f) => s + f.monto_asignado, 0);
        expect(Math.round(suma * 100)).toBe(15000000);
    });

    it('reemplaza correctamente la cantidad de participantes (menos que antes)', () => {
        const filas = dividirEntreParticipantes(100, ['a', 'b'], 'a');
        expect(filas).toHaveLength(2);
    });

    it('reemplaza correctamente la cantidad de participantes (más que antes)', () => {
        const filas = dividirEntreParticipantes(100, ['a', 'b', 'c', 'd'], 'a');
        expect(filas).toHaveLength(4);
    });
});
