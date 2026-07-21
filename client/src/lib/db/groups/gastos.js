import { supabase } from '../../supabase';
import { filtrarTarjetaCredito, limpiarSufijoCuota } from '../../cuotasGroupHelper';
import { obtenerTokenActivo, validarMonto, BACKEND_URL, MAX_CUOTAS_GRUPAL } from '../_helpers';

// --- 2.4 Gastos grupales ---

/**
 * Crea un gasto grupal con división igualitaria entre los participantes.
 * La diferencia de centavos por redondeo se asigna al pagador si participa,
 * o al primer participante de la lista en caso contrario.
 *
 * @param {Object} params
 * @param {number} params.grupoId - ID del grupo
 * @param {string} params.descripcion - Descripción del gasto
 * @param {number} params.monto - Monto total (debe ser > 0)
 * @param {string} params.pagadoPor - UUID del usuario que pagó
 * @param {string} params.fecha - Fecha en formato YYYY-MM-DD
 * @param {string} [params.nota] - Nota opcional
 * @param {number} [params.idCategoria] - ID de categoría (nullable)
 * @param {string[]} params.participantesUserIds - Array de UUIDs de participantes (mínimo 1)
 * @returns {Object} { gasto, participantes }
 */
export const crearGastoGrupal = async ({
    grupoId,
    descripcion,
    monto,
    pagadoPor,
    fecha,
    nota,
    idCategoria,
    idMetodoPago,
    participantesUserIds,
}) => {
    if (!grupoId) throw new Error('ID de grupo requerido');
    if (!descripcion || !descripcion.trim()) throw new Error('La descripción es requerida');
    validarMonto(monto);
    const montoNum = Number(monto);
    if (!pagadoPor) throw new Error('El pagador es requerido');
    if (!idMetodoPago) throw new Error('El método de pago es requerido');
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        throw new Error('Debe haber al menos un participante');
    }

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/gastos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ descripcion, monto: montoNum, pagadoPor, fecha, nota, idCategoria, idMetodoPago, participantesUserIds }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al crear el gasto');
    return { gasto: json.gasto, participantes: json.participantes };
};

/**
 * Crea un gasto grupal en cuotas con tarjeta de crédito.
 * Genera una cuota por mes durante N meses, comenzando el 1er día del mes siguiente.
 * Cada cuota se divide igualitariamente entre los participantes seleccionados.
 *
 * @param {Object} params
 * @param {number}   params.grupoId              - ID del grupo
 * @param {string}   params.descripcion           - Descripción del gasto
 * @param {number}   params.monto                 - Monto total de la compra
 * @param {number}   params.cuotas                - Cantidad de cuotas (2-18)
 * @param {string}   params.pagadoPor             - UUID del usuario que pagó
 * @param {string}   [params.fecha]               - Fecha de la compra (YYYY-MM-DD)
 * @param {string}   [params.nota]                - Nota opcional
 * @param {number}   [params.idCategoria]         - ID de categoría (nullable)
 * @param {string[]} params.participantesUserIds  - Array de UUIDs de participantes
 * @returns {{ gasto: Object, gastos: Object[], participantes: Object[] }}
 */
export const crearGastoGrupalEnCuotas = async ({
    grupoId,
    descripcion,
    monto,
    cuotas,
    pagadoPor,
    fecha,
    primeraCuota,
    nota,
    idCategoria,
    idMetodoPago,
    participantesUserIds,
}) => {
    if (!grupoId) throw new Error('ID de grupo requerido');
    if (!descripcion || !descripcion.trim()) throw new Error('La descripción es requerida');
    validarMonto(monto);
    const montoNum = Number(monto);
    const cantCuotas = Math.max(1, Math.min(MAX_CUOTAS_GRUPAL, parseInt(cuotas) || 1));
    if (!pagadoPor) throw new Error('El pagador es requerido');
    if (!primeraCuota) throw new Error('Indicá en qué mes vence la primera cuota');
    if (!idMetodoPago) throw new Error('El método de pago es requerido');
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        throw new Error('Debe haber al menos un participante');
    }

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/gastos-cuotas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            descripcion,
            monto: montoNum,
            cuotas: cantCuotas,
            pagadoPor,
            fecha,
            primeraCuota,
            nota,
            idCategoria,
            idMetodoPago,
            participantesUserIds,
        }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al crear el gasto en cuotas');
    return { gasto: json.gasto, gastos: json.gastos, participantes: json.participantes };
};

/**
 * Obtiene los gastos en cuotas activos de un grupo, agrupados por id_gasto_padre.
 * Solo incluye compras con método de pago que acepta cuotas (metodos_pago.acepta_cuotas = true).
 * Útil para mostrar el panel de cuotas en el detalle del grupo.
 *
 * @param {number} grupoId - ID del grupo
 * @returns {Array} Grupos de cuotas: [{ id, descripcionBase, totalOriginal, cuotas, pagadas, pendientes, montoMensual, cuotasList }]
 */
export const obtenerCuotasGrupal = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { data, error } = await supabase
        .from('grupo_gastos')
        .select('id, descripcion, monto, fecha, cuotas, numero_cuota, id_gasto_padre, estado, pagado_por, metodos_pago:id_metodo_pago(acepta_cuotas)')
        .eq('grupo_id', grupoId)
        .eq('estado', 'activo')
        .not('id_gasto_padre', 'is', null)
        .order('id_gasto_padre', { ascending: true })
        .order('numero_cuota', { ascending: true });

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return [];

    const soloTarjeta = filtrarTarjetaCredito(data);
    if (soloTarjeta.length === 0) return [];

    // Agrupar por id_gasto_padre
    const grupos = new Map();
    for (const cuota of soloTarjeta) {
        const padreId = cuota.id_gasto_padre;
        if (!grupos.has(padreId)) grupos.set(padreId, []);
        grupos.get(padreId).push(cuota);
    }

    const hoy = new Date().toISOString().split('T')[0];

    return Array.from(grupos.values()).map(cuotasList => {
        const primera = cuotasList[0];
        // Quitar el sufijo "(1/N)" para mostrar la descripción base
        const descripcionBase = limpiarSufijoCuota(primera.descripcion);
        const totalOriginal = cuotasList.reduce((sum, c) => sum + Number(c.monto), 0);
        const pagadas  = cuotasList.filter(c => c.fecha <= hoy).length;
        const pendientes = cuotasList.filter(c => c.fecha > hoy).length;

        return {
            id:             primera.id_gasto_padre,
            descripcionBase,
            totalOriginal:  Math.round(totalOriginal * 100) / 100,
            cuotas:         primera.cuotas,
            pagadas,
            pendientes,
            montoMensual:   primera.monto,
            pagadoPor:      primera.pagado_por,
            cuotasList,
        };
    });
};

/**
 * Obtiene todas las cuotas activas de una compra grupal (todas las filas que
 * comparten el mismo id_gasto_padre). Usado para editar: el monto de cada fila
 * es la porción de esa cuota puntual, así que el total de la compra se calcula
 * sumando todas.
 *
 * @param {number} idGastoPadre - ID de la primera cuota (autoreferenciada como padre)
 * @returns {Array} Cuotas de la compra ordenadas por numero_cuota
 */
export const obtenerCuotasDeCompra = async (idGastoPadre) => {
    if (!idGastoPadre) throw new Error('ID de gasto inválido');

    const { data, error } = await supabase
        .from('grupo_gastos')
        .select('id, monto, numero_cuota')
        .eq('id_gasto_padre', idGastoPadre)
        .eq('estado', 'activo')
        .order('numero_cuota', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
};

/**
 * Obtiene los gastos activos de un grupo con paginación.
 *
 * @param {number} grupoId - ID del grupo
 * @param {Object} [opciones]
 * @param {number} [opciones.limite=50] - Cantidad máxima de resultados
 * @param {number} [opciones.offset=0] - Desplazamiento para paginación
 * @returns {Array} Lista de gastos activos ordenados por fecha descendente
 */
export const obtenerGastosDelGrupo = async (grupoId, { limite = 50, offset = 0 } = {}) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { data, error } = await supabase
        .from('grupo_gastos')
        .select('*')
        .eq('grupo_id', grupoId)
        .eq('estado', 'activo')
        .is('id_gasto_padre', null)
        .order('fecha', { ascending: false })
        .range(offset, offset + limite - 1);

    if (error) throw new Error(error.message);
    return data ?? [];
};

/**
 * Obtiene un gasto grupal con el detalle de sus participantes y montos asignados.
 *
 * @param {number} gastoId - ID del gasto
 * @returns {Object} El gasto con array de participantes
 */
export const obtenerGastoConParticipantes = async (gastoId) => {
    if (!gastoId) throw new Error('ID de gasto inválido');

    const { data: gasto, error: errGasto } = await supabase
        .from('grupo_gastos')
        .select('*')
        .eq('id', gastoId)
        .single();

    if (errGasto) throw new Error(errGasto.message);

    const { data: participantes, error: errPart } = await supabase
        .from('grupo_gasto_participantes')
        .select('id, user_id, monto_asignado, porcentaje, fecha_creacion')
        .eq('gasto_id', gastoId)
        .order('fecha_creacion', { ascending: true });

    if (errPart) throw new Error(errPart.message);

    return { ...gasto, participantes: participantes ?? [] };
};

/**
 * Anula un gasto grupal (soft delete: estado='anulado').
 * El gasto deja de contar en saldos pero se preserva el historial.
 * Solo el creador o admin del grupo puede anular (RLS lo valida).
 *
 * @param {number} gastoId - ID del gasto a anular
 */
export const anularGastoGrupal = async (gastoId, grupoId) => {
    if (!gastoId) throw new Error('ID de gasto inválido');
    if (!grupoId) throw new Error('ID de grupo inválido');

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/gastos/${gastoId}/anular`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al anular el gasto');
};

/**
 * Anula todas las cuotas de una compra grupal en cuotas (opera sobre id_gasto_padre).
 * Si hay cuotas ya vencidas, el backend devuelve 409 con tieneVencidas: true.
 * En ese caso llamar de nuevo con force: true para confirmar.
 *
 * @param {number}  gastoId - ID del gasto padre (primera cuota)
 * @param {number}  grupoId - ID del grupo
 * @param {boolean} force   - true para confirmar anulación con cuotas ya vencidas
 * @returns {{ cuotasAnuladas: number }}
 */
export const anularCuotasGrupales = async (gastoId, grupoId, force = false) => {
    if (!gastoId) throw new Error('ID de gasto inválido');
    if (!grupoId) throw new Error('ID de grupo inválido');

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/gastos/${gastoId}/anular-cuotas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ force }),
    });

    const json = await res.json();
    if (!res.ok) {
        const err = new Error(json.error || 'Error al anular las cuotas');
        err.tieneVencidas    = json.tieneVencidas ?? false;
        err.cuotasVencidas   = json.cuotasVencidas ?? 0;
        err.cuotasTotales    = json.cuotasTotales ?? 0;
        throw err;
    }
    return json;
};

/**
 * Actualiza los campos de un gasto grupal activo y recalcula la división igualitaria.
 * Elimina los participantes anteriores (CASCADE) e inserta los nuevos.
 * Solo el creador o admin puede editar (RLS lo valida).
 *
 * @param {string} gastoId - ID del gasto a editar
 * @param {Object} campos - Campos a actualizar: descripcion, monto (total de la
 *   compra si tiene cuotas), cuotas, pagadoPor, fecha, idCategoria, nota, participantesUserIds
 * @returns {Object} El gasto actualizado con los nuevos participantes
 */
export const actualizarGastoGrupal = async (gastoId, { grupoId, descripcion, monto, cuotas, pagadoPor, fecha, primeraCuota, idCategoria, idMetodoPago, nota, participantesUserIds }) => {
    if (!gastoId) throw new Error('ID de gasto inválido');
    if (!grupoId) throw new Error('ID de grupo inválido');
    if (!participantesUserIds?.length) throw new Error('Se requiere al menos un participante');
    if (!idMetodoPago) throw new Error('El método de pago es requerido');
    validarMonto(monto);
    const montoNum = Number(monto);

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/gastos/${gastoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ descripcion, monto: montoNum, cuotas, pagadoPor, fecha, primeraCuota, idCategoria, idMetodoPago, nota, participantesUserIds }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al actualizar el gasto');
    return { gasto: json.gasto, participantes: json.participantes };
};

/**
 * Solicita la eliminación de un grupo al backend.
 * El backend valida que todos los saldos sean cero antes de eliminar.
 * Solo admins pueden eliminar (validado en el backend).
 *
 * @param {string} grupoId - ID del grupo a eliminar
 */
export const eliminarGrupo = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const token = await obtenerTokenActivo();

    const res = await fetch(`/api/grupos/${grupoId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'No se pudo eliminar el grupo');
    return json;
};
