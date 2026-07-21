/**
 * Tests de la lógica de grupos/liquidaciones en db.js — el "ledger" financiero
 * compartido entre usuarios. Cubre registrarLiquidacion, obtenerSaldosDelGrupo
 * y crearGastoGrupalEnCuotas.
 *
 * registrarLiquidacion y crearGastoGrupalEnCuotas NO usan Supabase directo:
 * delegan al backend vía fetch (el backend valida y escribe). Por eso se
 * mockea `globalThis.fetch`, no `supabase.from`. obtenerSaldosDelGrupo sí usa
 * Supabase directo contra la vista `vw_grupo_saldos`, así que ahí se mockea
 * `supabase.from(...).select(...).eq(...)` igual que en db.createExpense.test.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();

vi.mock('./supabase', () => ({
    supabase: {
        auth: { getSession: (...args) => mockGetSession(...args) },
        from: (...args) => mockFrom(...args),
    },
}));

const USUARIO_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const OTRO_USUARIO_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const ACCESS_TOKEN = 'fake-jwt-token';

describe('registrarLiquidacion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSession.mockResolvedValue({
            data: { session: { access_token: ACCESS_TOKEN, user: { id: USUARIO_ID } } },
        });
        globalThis.fetch = vi.fn();
    });

    it('registra la liquidación con POST al backend y devuelve el registro creado', async () => {
        globalThis.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, liquidacion: { id: 1, de_user_id: USUARIO_ID, para_user_id: OTRO_USUARIO_ID, monto: 500 } }),
        });

        const { registrarLiquidacion } = await import('./db.js');
        const resultado = await registrarLiquidacion({
            grupoId: 7,
            deUserId: USUARIO_ID,
            paraUserId: OTRO_USUARIO_ID,
            monto: 500,
            fecha: '2026-07-21',
        });

        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/grupos/7/liquidaciones'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                }),
            }),
        );
        const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(body).toEqual(expect.objectContaining({
            deUserId: USUARIO_ID,
            paraUserId: OTRO_USUARIO_ID,
            monto: 500,
            fecha: '2026-07-21',
        }));
        expect(resultado).toEqual({ id: 1, de_user_id: USUARIO_ID, para_user_id: OTRO_USUARIO_ID, monto: 500 });
    });

    it('rechaza si el pagador y el receptor son la misma persona (sin llamar al backend)', async () => {
        const { registrarLiquidacion } = await import('./db.js');

        await expect(registrarLiquidacion({
            grupoId: 7,
            deUserId: USUARIO_ID,
            paraUserId: USUARIO_ID,
            monto: 500,
        })).rejects.toThrow(/misma persona/);

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('rechaza monto <= 0 antes de llamar al backend', async () => {
        const { registrarLiquidacion } = await import('./db.js');

        await expect(registrarLiquidacion({
            grupoId: 7,
            deUserId: USUARIO_ID,
            paraUserId: OTRO_USUARIO_ID,
            monto: 0,
        })).rejects.toThrow(/mayor a cero/);

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('rechaza si falta deUserId o paraUserId', async () => {
        const { registrarLiquidacion } = await import('./db.js');

        await expect(registrarLiquidacion({
            grupoId: 7,
            deUserId: USUARIO_ID,
            paraUserId: undefined,
            monto: 500,
        })).rejects.toThrow(/requeridos/);

        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('propaga el mensaje de error que devuelve el backend cuando la respuesta no es ok', async () => {
        globalThis.fetch.mockResolvedValue({
            ok: false,
            json: async () => ({ ok: false, error: 'El deudor no pertenece al grupo' }),
        });

        const { registrarLiquidacion } = await import('./db.js');
        await expect(registrarLiquidacion({
            grupoId: 7,
            deUserId: USUARIO_ID,
            paraUserId: OTRO_USUARIO_ID,
            monto: 500,
        })).rejects.toThrow('El deudor no pertenece al grupo');
    });
});

describe('obtenerSaldosDelGrupo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Encadenamiento .from('vw_grupo_saldos').select('*').eq('grupo_id', id)
        mockFrom.mockReturnValue({ select: mockSelect });
        mockSelect.mockReturnValue({ eq: mockEq });
    });

    it('consulta la vista vw_grupo_saldos filtrando por grupo_id', async () => {
        mockEq.mockResolvedValue({ data: [], error: null });

        const { obtenerSaldosDelGrupo } = await import('./db.js');
        await obtenerSaldosDelGrupo(7);

        expect(mockFrom).toHaveBeenCalledWith('vw_grupo_saldos');
        expect(mockSelect).toHaveBeenCalledWith('*');
        expect(mockEq).toHaveBeenCalledWith('grupo_id', 7);
    });

    it('grupo sin gastos: la vista no devuelve filas y la función retorna []', async () => {
        mockEq.mockResolvedValue({ data: [], error: null });

        const { obtenerSaldosDelGrupo } = await import('./db.js');
        const resultado = await obtenerSaldosDelGrupo(7);

        expect(resultado).toEqual([]);
    });

    it('retorna [] cuando Supabase devuelve data null (sin error)', async () => {
        mockEq.mockResolvedValue({ data: null, error: null });

        const { obtenerSaldosDelGrupo } = await import('./db.js');
        const resultado = await obtenerSaldosDelGrupo(7);

        expect(resultado).toEqual([]);
    });

    it('2 miembros balanceados: saldo_neto en cero para ambos', async () => {
        mockEq.mockResolvedValue({
            data: [
                { user_id: USUARIO_ID, pagado: 100, asignado: 100, liquidado_enviado: 0, liquidado_recibido: 0, saldo_neto: 0 },
                { user_id: OTRO_USUARIO_ID, pagado: 100, asignado: 100, liquidado_enviado: 0, liquidado_recibido: 0, saldo_neto: 0 },
            ],
            error: null,
        });

        const { obtenerSaldosDelGrupo } = await import('./db.js');
        const resultado = await obtenerSaldosDelGrupo(7);

        expect(resultado).toHaveLength(2);
        resultado.forEach((saldo) => expect(saldo.saldo_neto).toBe(0));
    });

    it('deuda unidireccional: uno positivo (le deben) y el otro negativo (debe) en la misma magnitud', async () => {
        mockEq.mockResolvedValue({
            data: [
                { user_id: USUARIO_ID, pagado: 200, asignado: 100, liquidado_enviado: 0, liquidado_recibido: 0, saldo_neto: 100 },
                { user_id: OTRO_USUARIO_ID, pagado: 0, asignado: 100, liquidado_enviado: 0, liquidado_recibido: 0, saldo_neto: -100 },
            ],
            error: null,
        });

        const { obtenerSaldosDelGrupo } = await import('./db.js');
        const resultado = await obtenerSaldosDelGrupo(7);

        const total = resultado.reduce((sum, s) => sum + s.saldo_neto, 0);
        expect(total).toBe(0); // el ledger siempre debe sumar cero entre todos los miembros
        expect(resultado.find((s) => s.user_id === USUARIO_ID).saldo_neto).toBe(100);
        expect(resultado.find((s) => s.user_id === OTRO_USUARIO_ID).saldo_neto).toBe(-100);
    });

    it('múltiples gastos: saldo_neto refleja pagado + liquidado_enviado - asignado - liquidado_recibido', async () => {
        // Escenario: USUARIO_ID pagó 300 en total, le asignaron 150, y ya liquidó (pagó fuera) 20.
        // saldo_neto esperado = 300 + 20 - 150 - 0 = 170
        mockEq.mockResolvedValue({
            data: [
                { user_id: USUARIO_ID, pagado: 300, asignado: 150, liquidado_enviado: 20, liquidado_recibido: 0, saldo_neto: 170 },
            ],
            error: null,
        });

        const { obtenerSaldosDelGrupo } = await import('./db.js');
        const [saldo] = await obtenerSaldosDelGrupo(7);

        expect(saldo.saldo_neto).toBe(170);
    });

    it('propaga el error si Supabase falla', async () => {
        mockEq.mockResolvedValue({ data: null, error: new Error('permission denied for view vw_grupo_saldos') });

        const { obtenerSaldosDelGrupo } = await import('./db.js');
        await expect(obtenerSaldosDelGrupo(7)).rejects.toThrow('permission denied for view vw_grupo_saldos');
    });

    it('rechaza grupoId inválido sin consultar Supabase', async () => {
        const { obtenerSaldosDelGrupo } = await import('./db.js');

        await expect(obtenerSaldosDelGrupo(null)).rejects.toThrow(/inválido/);
        expect(mockFrom).not.toHaveBeenCalled();
    });
});

describe('crearGastoGrupalEnCuotas', () => {
    const paramsBase = {
        grupoId: 7,
        descripcion: 'notebook en cuotas',
        monto: 300000,
        cuotas: 3,
        pagadoPor: USUARIO_ID,
        fecha: '2026-07-21',
        primeraCuota: '2026-08',
        idMetodoPago: 2,
        participantesUserIds: [USUARIO_ID, OTRO_USUARIO_ID],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSession.mockResolvedValue({
            data: { session: { access_token: ACCESS_TOKEN, user: { id: USUARIO_ID } } },
        });
        globalThis.fetch = vi.fn();
    });

    it('llama al backend con POST y el payload con cuotas dividido entre participantes', async () => {
        globalThis.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                ok: true,
                gasto: { id: 10, id_gasto_padre: 10 },
                gastos: [{ id: 10 }, { id: 11 }, { id: 12 }],
                participantes: [
                    { user_id: USUARIO_ID, monto_asignado: 50000 },
                    { user_id: OTRO_USUARIO_ID, monto_asignado: 50000 },
                ],
            }),
        });

        const { crearGastoGrupalEnCuotas } = await import('./db.js');
        const resultado = await crearGastoGrupalEnCuotas(paramsBase);

        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/grupos/7/gastos-cuotas'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: `Bearer ${ACCESS_TOKEN}` }),
            }),
        );
        const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(body).toEqual(expect.objectContaining({
            descripcion: 'notebook en cuotas',
            monto: 300000,
            cuotas: 3,
            pagadoPor: USUARIO_ID,
            primeraCuota: '2026-08',
            participantesUserIds: [USUARIO_ID, OTRO_USUARIO_ID],
        }));
        expect(resultado.gastos).toHaveLength(3);
        expect(resultado.participantes).toHaveLength(2);
    });

    it('clampea la cantidad de cuotas al máximo permitido (MAX_CUOTAS_GRUPAL = 18)', async () => {
        globalThis.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, gasto: {}, gastos: [], participantes: [] }),
        });

        const { crearGastoGrupalEnCuotas } = await import('./db.js');
        await crearGastoGrupalEnCuotas({ ...paramsBase, cuotas: 999 });

        const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(body.cuotas).toBe(18);
    });

    it('exige primeraCuota antes de llamar al backend', async () => {
        const { crearGastoGrupalEnCuotas } = await import('./db.js');

        await expect(crearGastoGrupalEnCuotas({ ...paramsBase, primeraCuota: undefined }))
            .rejects.toThrow(/primera cuota/i);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('exige al menos un participante', async () => {
        const { crearGastoGrupalEnCuotas } = await import('./db.js');

        await expect(crearGastoGrupalEnCuotas({ ...paramsBase, participantesUserIds: [] }))
            .rejects.toThrow(/participante/i);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('rechaza monto <= 0 antes de llamar al backend', async () => {
        const { crearGastoGrupalEnCuotas } = await import('./db.js');

        await expect(crearGastoGrupalEnCuotas({ ...paramsBase, monto: -5 }))
            .rejects.toThrow(/mayor a cero/);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('propaga el error del backend cuando la respuesta no es ok', async () => {
        globalThis.fetch.mockResolvedValue({
            ok: false,
            json: async () => ({ ok: false, error: 'El método de pago no acepta cuotas' }),
        });

        const { crearGastoGrupalEnCuotas } = await import('./db.js');
        await expect(crearGastoGrupalEnCuotas(paramsBase))
            .rejects.toThrow('El método de pago no acepta cuotas');
    });
});
