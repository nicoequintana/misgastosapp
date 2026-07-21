import { supabase } from '../../supabase';
import { obtenerTokenActivo, validarMonto, BACKEND_URL } from '../_helpers';

// --- 2.5 Liquidaciones ---

/**
 * Registra una liquidación entre dos miembros del grupo.
 * Una liquidación representa que un deudor le pagó a un acreedor fuera de la app.
 *
 * @param {Object} params
 * @param {number} params.grupoId - ID del grupo
 * @param {string} params.deUserId - UUID del usuario que paga la deuda
 * @param {string} params.paraUserId - UUID del usuario que recibe el pago
 * @param {number} params.monto - Monto de la liquidación (debe ser > 0)
 * @param {string} [params.fecha] - Fecha en formato YYYY-MM-DD (default: hoy)
 * @param {string} [params.nota] - Nota opcional
 * @returns {Object} La liquidación creada
 */
export const registrarLiquidacion = async ({ grupoId, deUserId, paraUserId, monto, fecha, nota }) => {
    if (!grupoId) throw new Error('ID de grupo requerido');
    if (!deUserId || !paraUserId) throw new Error('deUserId y paraUserId son requeridos');
    if (deUserId === paraUserId) throw new Error('El pagador y el receptor no pueden ser la misma persona');
    validarMonto(monto);
    const montoNum = Number(monto);

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/liquidaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deUserId, paraUserId, monto: montoNum, fecha, nota }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al registrar la liquidación');
    return json.liquidacion;
};

/**
 * Obtiene las liquidaciones confirmadas de un grupo.
 *
 * @param {number} grupoId - ID del grupo
 * @returns {Array} Lista de liquidaciones confirmadas ordenadas por fecha descendente
 */
export const obtenerLiquidacionesDelGrupo = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { data, error } = await supabase
        .from('grupo_liquidaciones')
        .select('*')
        .eq('grupo_id', grupoId)
        .eq('estado', 'confirmada')
        .order('fecha', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
};

/**
 * Anula una liquidación (soft delete: estado='anulada').
 * Solo el registrador o admin pueden anular (RLS lo valida).
 *
 * @param {number} liquidacionId - ID de la liquidación a anular
 */
export const anularLiquidacion = async (liquidacionId, grupoId) => {
    if (!liquidacionId) throw new Error('ID de liquidación inválido');
    if (!grupoId) throw new Error('ID de grupo inválido');

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/liquidaciones/${liquidacionId}/anular`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al anular la liquidación');
};

// --- 2.6 Saldos ---

/**
 * Obtiene los saldos actuales de todos los miembros activos de un grupo.
 * Consulta la vista `vw_grupo_saldos` que agrega pagos, asignaciones y liquidaciones.
 *
 * Fórmula del saldo_neto (positivo = te deben, negativo = debés):
 *   pagado + liquidado_enviado − asignado − liquidado_recibido
 *
 * @param {number} grupoId - ID del grupo
 * @returns {Array} [{ user_id, pagado, asignado, liquidado_enviado, liquidado_recibido, saldo_neto }, ...]
 */
export const obtenerSaldosDelGrupo = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { data, error } = await supabase
        .from('vw_grupo_saldos')
        .select('*')
        .eq('grupo_id', grupoId);

    if (error) throw new Error(error.message);
    return data ?? [];
};
