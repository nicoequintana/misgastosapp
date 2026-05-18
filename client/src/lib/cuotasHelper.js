/**
 * Helper puro para el cálculo de cuotas con tarjeta de crédito.
 * Sin efectos secundarios ni dependencias de red.
 * Usado tanto por gastos personales (createExpense) como por gastos grupales.
 */

/**
 * Calcula el array de cuotas para una compra con tarjeta de crédito.
 *
 * Reglas de negocio:
 *   - fechaPrimeraCuota define el mes exacto en que vence la cuota 1 (YYYY-MM-DD).
 *   - Siempre se normaliza al 1er día del mes indicado.
 *   - Cada cuota siguiente desplaza 1 mes.
 *   - Redondeo a centavos; diferencia por redondeo se asigna a la primera cuota.
 *   - Si cuotas > 1, la descripción de cada cuota lleva el sufijo "(N/total)".
 *
 * @param {number} monto             - Monto total de la compra (> 0)
 * @param {number} cantCuotas        - Cantidad de cuotas (1-18)
 * @param {string} fechaPrimeraCuota - Mes de la primera cuota en formato YYYY-MM (o YYYY-MM-DD)
 * @param {string} descripcion       - Descripción base ya normalizada (MAYÚSCULAS)
 * @returns {Array<{ numero: number, monto: number, fecha: string, descripcion: string }>}
 */
export function calcularCuotas(monto, cantCuotas, fechaPrimeraCuota, descripcion) {
    const n = Math.max(1, Math.min(18, Math.floor(cantCuotas)));
    const montoPorCuota = Math.floor((monto / n) * 100) / 100;
    const diferencia = Math.round((monto - montoPorCuota * n) * 100) / 100;

    // Parsear año y mes directamente del string para evitar ambigüedades de timezone.
    const [anioInicio, mesInicio] = fechaPrimeraCuota.slice(0, 7).split('-').map(Number);

    return Array.from({ length: n }, (_, i) => {
        const mesTotal  = mesInicio - 1 + i; // 0-indexed acumulado
        const anio      = anioInicio + Math.floor(mesTotal / 12);
        const mes       = (mesTotal % 12) + 1;
        const fechaStr  = `${anio}-${String(mes).padStart(2, '0')}-01`;

        const montoCuota = i === 0
            ? Math.round((montoPorCuota + diferencia) * 100) / 100
            : montoPorCuota;

        const descCuota = n > 1
            ? `${descripcion} (${i + 1}/${n})`
            : descripcion;

        return {
            numero:      i + 1,
            monto:       montoCuota,
            fecha:       fechaStr,
            descripcion: descCuota,
        };
    });
}

/**
 * Calcula la división igualitaria de un monto entre N participantes.
 * La diferencia por redondeo va al pagador si está en la lista,
 * o al primer participante si el pagador no participa.
 *
 * @param {number}   monto              - Monto total a dividir (> 0)
 * @param {string[]} participantesIds   - Array de UUIDs de participantes
 * @param {string}   pagadorId          - UUID del pagador
 * @returns {Array<{ user_id: string, monto_asignado: number }>}
 */
export function calcularDivisionIgualitaria(monto, participantesIds, pagadorId) {
    const n = participantesIds.length;
    const montoPorPersona = Math.floor((monto / n) * 100) / 100;
    const diferencia = Math.round((monto - montoPorPersona * n) * 100) / 100;

    // El participante que absorbe la diferencia: el pagador si participa, si no el primero
    const idxDiferencia = participantesIds.includes(pagadorId)
        ? participantesIds.indexOf(pagadorId)
        : 0;

    return participantesIds.map((user_id, i) => ({
        user_id,
        monto_asignado: i === idxDiferencia
            ? Math.round((montoPorPersona + diferencia) * 100) / 100
            : montoPorPersona,
    }));
}
