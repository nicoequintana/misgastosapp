/**
 * Tests para createExpense — fix C-01 (atomicidad vía RPC) y fix C-02
 * (id_categoria/id_metodo_pago = 0 no debe colapsar a null).
 *
 * Antes, el camino de cuotas hacía 3 llamadas separadas a Supabase con
 * rollback manual por DELETE. Ahora delega todo a una única llamada RPC
 * (create_expense_installments), que corre en una transacción de Postgres.
 * Estos tests verifican que createExpense arma correctamente el payload del
 * RPC y maneja sus respuestas — no testean el RPC en sí (eso vive en SQL,
 * server/db/migrations/20260720_rpc_create_expense_installments.sql).
 *
 * C-02: ambos caminos (con y sin cuotas) usaban `gasto.id_categoria || null`,
 * que colapsa el ID 0 (falsy) a null. Se corrigió a `?? null` en los dos
 * lugares — ver client/src/lib/db.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockRpc = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();

vi.mock('./supabase', () => ({
    supabase: {
        auth: { getSession: (...args) => mockGetSession(...args) },
        rpc: (...args) => mockRpc(...args),
        from: (...args) => mockFrom(...args),
    },
}));

const USUARIO_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('createExpense', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSession.mockResolvedValue({ data: { session: { user: { id: USUARIO_ID } } } });

        // Encadenamiento .from().insert().select().single() para el camino sin cuotas
        mockFrom.mockReturnValue({ insert: mockInsert });
        mockInsert.mockReturnValue({ select: mockSelect });
        mockSelect.mockReturnValue({ single: mockSingle });
    });

    describe('gasto sin cuotas', () => {
        it('inserta un único registro sin llamar al RPC', async () => {
            mockSingle.mockResolvedValue({ data: { id: 1, descripcion: 'SUPERMERCADO' }, error: null });

            const { createExpense } = await import('./db.js');
            await createExpense({ monto: 500, descripcion: 'supermercado', id_categoria: 3, id_metodo_pago: 1 });

            expect(mockRpc).not.toHaveBeenCalled();
            expect(mockFrom).toHaveBeenCalledWith('gastos');
            expect(mockInsert).toHaveBeenCalledWith([
                expect.objectContaining({ descripcion: 'SUPERMERCADO', monto: 500, cuotas: 1, id_gasto_padre: null }),
            ]);
        });

        it('usa "SIN DESCRIPCIÓN" cuando no se provee descripción (regla de negocio CLAUDE.md #11)', async () => {
            mockSingle.mockResolvedValue({ data: { id: 1, descripcion: 'SIN DESCRIPCIÓN' }, error: null });

            const { createExpense } = await import('./db.js');
            await createExpense({ monto: 500, id_categoria: 3, id_metodo_pago: 1 });

            expect(mockInsert).toHaveBeenCalledWith([
                expect.objectContaining({ descripcion: 'SIN DESCRIPCIÓN' }),
            ]);
        });

        it('no colapsa id_categoria = 0 a null (fix C-02: usar ?? en vez de ||)', async () => {
            mockSingle.mockResolvedValue({ data: { id: 1 }, error: null });

            const { createExpense } = await import('./db.js');
            await createExpense({ monto: 500, descripcion: 'test', id_categoria: 0, id_metodo_pago: 1 });

            expect(mockInsert).toHaveBeenCalledWith([
                expect.objectContaining({ id_categoria: 0 }),
            ]);
        });

        it('lanza error si Supabase devuelve data null sin error (RLS rechaza el insert)', async () => {
            mockSingle.mockResolvedValue({ data: null, error: null });

            const { createExpense } = await import('./db.js');
            await expect(createExpense({ monto: 500, descripcion: 'test' }))
                .rejects.toThrow(/No se pudo guardar/);
        });

        it('propaga el error si Supabase falla en el insert', async () => {
            mockSingle.mockResolvedValue({ data: null, error: new Error('duplicate key') });

            const { createExpense } = await import('./db.js');
            await expect(createExpense({ monto: 500, descripcion: 'test' }))
                .rejects.toThrow('duplicate key');
        });
    });

    describe('gasto en cuotas (tarjeta/préstamo)', () => {
        const gastoBase = {
            monto: 300000,
            descripcion: 'notebook nueva',
            esTarjetaCredito: true,
            cuotas: 3,
            primeraCuota: '2026-08',
            id_categoria: 5,
            id_metodo_pago: 2,
        };

        it('llama al RPC create_expense_installments con el payload correcto', async () => {
            mockRpc.mockResolvedValue({
                data: [{ id: 10, numero_cuota: 1, id_gasto_padre: 10 }],
                error: null,
            });

            const { createExpense } = await import('./db.js');
            await createExpense(gastoBase);

            expect(mockRpc).toHaveBeenCalledWith('create_expense_installments', {
                p_descripcion: 'NOTEBOOK NUEVA',
                p_monto_total: 300000,
                p_cuotas: 3,
                p_fecha_primera_cuota: '2026-08',
                p_id_categoria: 5,
                p_id_metodo_pago: 2,
            });
        });

        it('NO hace ningún insert/delete manual en la tabla gastos (sin rollback a mano)', async () => {
            mockRpc.mockResolvedValue({ data: [{ id: 10, numero_cuota: 1 }], error: null });

            const { createExpense } = await import('./db.js');
            await createExpense(gastoBase);

            expect(mockFrom).not.toHaveBeenCalled();
        });

        it('retorna la primera cuota (el padre) de la respuesta del RPC', async () => {
            const filas = [
                { id: 10, numero_cuota: 1, id_gasto_padre: 10 },
                { id: 11, numero_cuota: 2, id_gasto_padre: 10 },
            ];
            mockRpc.mockResolvedValue({ data: filas, error: null });

            const { createExpense } = await import('./db.js');
            const resultado = await createExpense(gastoBase);

            expect(resultado).toEqual(filas[0]);
        });

        it('propaga el error si el RPC falla', async () => {
            mockRpc.mockResolvedValue({ data: null, error: new Error('constraint violation') });

            const { createExpense } = await import('./db.js');
            await expect(createExpense(gastoBase)).rejects.toThrow('constraint violation');
        });

        it('lanza error si el RPC no devuelve filas', async () => {
            mockRpc.mockResolvedValue({ data: [], error: null });

            const { createExpense } = await import('./db.js');
            await expect(createExpense(gastoBase)).rejects.toThrow(/No se pudo guardar/);
        });

        it('exige primeraCuota antes de llamar al RPC', async () => {
            const { createExpense } = await import('./db.js');
            await expect(createExpense({ ...gastoBase, primeraCuota: undefined }))
                .rejects.toThrow(/primera cuota/i);
            expect(mockRpc).not.toHaveBeenCalled();
        });

        it('funciona igual para préstamos (esPrestamo) que para tarjeta', async () => {
            mockRpc.mockResolvedValue({ data: [{ id: 20, numero_cuota: 1 }], error: null });

            const { createExpense } = await import('./db.js');
            await createExpense({ ...gastoBase, esTarjetaCredito: false, esPrestamo: true, cuotas: 12 });

            expect(mockRpc).toHaveBeenCalledWith('create_expense_installments', expect.objectContaining({ p_cuotas: 12 }));
        });

        it('no colapsa id_categoria = 0 a null en el payload del RPC (ya usa ?? — cubre C-02 en el camino de cuotas)', async () => {
            mockRpc.mockResolvedValue({ data: [{ id: 30, numero_cuota: 1 }], error: null });

            const { createExpense } = await import('./db.js');
            await createExpense({ ...gastoBase, id_categoria: 0 });

            expect(mockRpc).toHaveBeenCalledWith('create_expense_installments', expect.objectContaining({ p_id_categoria: 0 }));
        });
    });
});
