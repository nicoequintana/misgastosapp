/**
 * Tests para la validación/normalización de fecha del RPC create_expense_installments
 * (server/db/migrations/20260720_rpc_create_expense_installments.sql).
 *
 * create_grupo_gasto_installments (migrations/20260721_*.sql) usa el mismo
 * contrato de p_fecha_primera_cuota (TEXT, formato YYYY-MM, normalizado con
 * to_date(...) dentro de la función) — estos tests cubren ambos RPCs.
 *
 * El RPC vive en PL/pgSQL, no en JS — no se puede importar y ejecutar aquí. Estos
 * tests replican en JS el contrato de validación de p_fecha_primera_cuota para
 * documentar y trabar el bug real encontrado en producción: el parámetro se
 * definió como DATE, y PostgREST intentaba castear "2026-08" (el formato que
 * manda <input type="month">) directo a DATE, fallando con
 * "invalid input syntax for type date" antes de llegar al cuerpo de la función.
 * El fix: el parámetro es TEXT y la función normaliza a DATE con to_date(...).
 */

const FORMATO_FECHA_REGEX = /^\d{4}-\d{2}(-\d{2})?$/;

// normalizarFechaPrimeraCuota — misma lógica que el RPC:
// IF p_fecha_primera_cuota !~ '^\d{4}-\d{2}(-\d{2})?$' THEN RAISE EXCEPTION ...
// v_fecha_primera := to_date(left(p_fecha_primera_cuota, 7) || '-01', 'YYYY-MM-DD');
function normalizarFechaPrimeraCuota(input) {
    if (input === null || input === undefined || String(input).trim() === '') {
        throw new Error('Indicá en qué mes vence la primera cuota');
    }
    if (!FORMATO_FECHA_REGEX.test(input)) {
        throw new Error('Formato de fecha inválido, se espera YYYY-MM');
    }
    return `${input.slice(0, 7)}-01`;
}

describe('normalizarFechaPrimeraCuota (fix bug de la migración C-01)', () => {
    it('acepta el formato YYYY-MM que manda <input type="month"> y lo normaliza al día 1', () => {
        // Este es el caso que rompía en producción: "2026-08" fallaba contra DATE.
        expect(normalizarFechaPrimeraCuota('2026-08')).toBe('2026-08-01');
    });

    it('acepta YYYY-MM-DD y lo normaliza igual al día 1 del mes (ignora el día recibido)', () => {
        expect(normalizarFechaPrimeraCuota('2026-08-15')).toBe('2026-08-01');
    });

    it('rechaza formato vacío', () => {
        expect(() => normalizarFechaPrimeraCuota('')).toThrow(/primera cuota/i);
    });

    it('rechaza null/undefined', () => {
        expect(() => normalizarFechaPrimeraCuota(null)).toThrow(/primera cuota/i);
        expect(() => normalizarFechaPrimeraCuota(undefined)).toThrow(/primera cuota/i);
    });

    it('rechaza formato inválido (mes sin ceros, texto libre, etc.)', () => {
        expect(() => normalizarFechaPrimeraCuota('2026-8')).toThrow(/formato de fecha/i);
        expect(() => normalizarFechaPrimeraCuota('agosto 2026')).toThrow(/formato de fecha/i);
        expect(() => normalizarFechaPrimeraCuota('2026/08')).toThrow(/formato de fecha/i);
    });

    it('normaliza diciembre correctamente (sin desbordar al año siguiente en la propia fecha 1)', () => {
        expect(normalizarFechaPrimeraCuota('2026-12')).toBe('2026-12-01');
    });
});
