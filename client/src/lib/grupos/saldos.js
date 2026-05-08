/**
 * Algoritmo greedy para minimizar transferencias entre N personas.
 *
 * Principio: siempre emparejamos al deudor más grande con el acreedor más grande.
 * Esto garantiza la menor cantidad posible de transferencias (máximo N-1 en un grupo de N).
 *
 * Complejidad: O(N log N) por el sort inicial. Para grupos de <= 20 miembros es trivial.
 */

/**
 * Calcula las transferencias mínimas necesarias para saldar todas las deudas del grupo.
 *
 * @param {Array<{user_id: string, saldo_neto: number, alias?: string}>} saldos
 *   Array de saldos por miembro. saldo_neto positivo = te deben; negativo = debés.
 * @returns {Array<{de: string, para: string, monto: number}>}
 *   Lista mínima de transferencias. 'de' es el user_id que paga, 'para' el que cobra.
 */
export const calcularTransferencias = (saldos) => {
    if (!Array.isArray(saldos) || saldos.length === 0) return [];

    // Separamos acreedores (saldo positivo) y deudores (saldo negativo).
    // Usamos un umbral de 0.01 para ignorar diferencias de centavo por redondeo flotante.
    const acreedores = saldos
        .filter(s => s.saldo_neto > 0.01)
        .map(s => ({ ...s, restante: s.saldo_neto }))
        .sort((a, b) => b.restante - a.restante); // mayor acreedor primero

    const deudores = saldos
        .filter(s => s.saldo_neto < -0.01)
        .map(s => ({ ...s, restante: -s.saldo_neto })) // convertimos a positivo para operar
        .sort((a, b) => b.restante - a.restante); // mayor deudor primero

    const transferencias = [];
    let i = 0; // índice en deudores
    let j = 0; // índice en acreedores

    while (i < deudores.length && j < acreedores.length) {
        // El monto de esta transferencia es el mínimo entre lo que debe el deudor y lo que le deben al acreedor
        const monto = Math.min(deudores[i].restante, acreedores[j].restante);

        transferencias.push({
            de: deudores[i].user_id,
            para: acreedores[j].user_id,
            monto: Math.round(monto * 100) / 100,
        });

        // Reducimos los saldos restantes de cada parte
        deudores[i].restante -= monto;
        acreedores[j].restante -= monto;

        // Avanzamos el puntero del que quedó saldado (restante < umbral)
        if (deudores[i].restante < 0.01) i++;
        if (acreedores[j].restante < 0.01) j++;
    }

    return transferencias;
};
