import { supabase } from '../supabase';
import { fechaHoyArgentina } from '../../utils/format';
import {
    agruparPorPadre,
    filtrarTarjetaCredito,
    filtrarPrestamos,
    transformarGrupoCuotas,
    transformarGrupoCuotasFuturas,
} from '../cuotasGroupHelper';
import { obtenerUsuarioActivo, calcularMesSiguiente, validarMonto, MAX_CUOTAS_PERSONAL } from './_helpers';

// ==================== GASTOS ====================

/**
 * Obtiene los gastos del usuario del mes actual.
 * Los gastos en cuotas tienen una fecha por cada mes, por lo que solo
 * aparecen en el mes que les corresponde y desaparecen solos cuando pasa su fecha.
 *
 * @returns {Array} Lista de gastos del mes en curso, ordenados por fecha descendente
 */
export const getExpenses = async () => {
    const usuario = await obtenerUsuarioActivo();

    // Rango del mes actual en Argentina (zona UTC-3 representada como string local)
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const desde = `${anio}-${mes}-01`;
    const { desde: hasta } = calcularMesSiguiente(anio, hoy.getMonth() + 1);

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            *,
            categorias:id_categoria (id, nombre, icono),
            metodos_pago:id_metodo_pago (id, nombre, icono)
        `)
        .eq('user_id', usuario.id)
        .gte('fecha', desde)
        .lt('fecha', hasta)
        .order('fecha', { ascending: false });

    if (error) throw error;
    return data ?? [];
};

/**
 * Crea un nuevo gasto para el usuario autenticado.
 * La descripción se normaliza a mayúsculas para consistencia.
 *
 * @param {Object} gasto - Datos del gasto a crear
 * @param {string} gasto.descripcion - Descripción del gasto
 * @param {number} gasto.monto - Monto del gasto (se convierte a número)
 * @param {string} gasto.id_categoria - ID de la categoría
 * @param {string} gasto.id_metodo_pago - ID del método de pago
 * @param {string} gasto.fecha - Fecha en formato ISO
 * @param {boolean} gasto.es_fijo - Si es un gasto fijo mensual
 * @returns {Object} El gasto creado
 * @throws {Error} Si el monto no es válido o es ≤ 0
 */
export const createExpense = async (gasto) => {
    const usuario = await obtenerUsuarioActivo();

    validarMonto(gasto.monto);
    const montoNumero = Number(gasto.monto);

    const esTarjetaCredito = gasto.esTarjetaCredito === true;
    const esPrestamo = gasto.esPrestamo === true;
    const esCuotas = esTarjetaCredito || esPrestamo;
    const cuotas = esCuotas ? Math.max(1, Math.min(MAX_CUOTAS_PERSONAL, parseInt(gasto.cuotas) || 1)) : 1;
    // La descripción es opcional: si el usuario no escribe nada, usamos un texto genérico.
    const descripcionBase = (typeof gasto.descripcion === 'string' && gasto.descripcion.trim())
        ? gasto.descripcion.trim().toUpperCase()
        : 'SIN DESCRIPCIÓN';

    if (!esCuotas) {
        // Gasto normal: inserción única
        const { data, error } = await supabase
            .from('gastos')
            .insert([{
                user_id: usuario.id,
                descripcion: descripcionBase,
                monto: montoNumero,
                // ?? en vez de || — evita colapsar id_categoria/id_metodo_pago = 0 a null (fix C-02).
                id_categoria: gasto.id_categoria ?? null,
                id_metodo_pago: gasto.id_metodo_pago ?? null,
                fecha: gasto.fecha || fechaHoyArgentina(),
                es_fijo: Boolean(gasto.es_fijo),
                cuotas: 1,
                numero_cuota: null,
                id_gasto_padre: null,
            }])
            .select()
            .single();

        if (error) {
            console.error('❌ Error en createExpense:', error);
            throw error;
        }
        // Supabase devuelve data: null sin error cuando RLS rechaza el insert silenciosamente.
        if (!data) throw new Error('No se pudo guardar el gasto. Verificá tu conexión o permisos.');
        return data;
    }

    // Gasto en cuotas (tarjeta de crédito o préstamo): el usuario define en qué mes vence la primera cuota.
    if (!gasto.primeraCuota) throw new Error('Indicá en qué mes vence la primera cuota');

    // Todas las cuotas se insertan en una sola transacción de Postgres (RPC
    // create_expense_installments — ver server/db/migrations/20260720_*.sql).
    // Antes esto eran 3 llamadas separadas (insert cuota 1 → update padre →
    // insert restantes) con rollback manual vía DELETE: si el proceso perdía
    // conexión a mitad de camino, el rollback nunca corría y quedaban cuotas
    // huérfanas. El RPC garantiza todo-o-nada (fix C-01).
    const { data: cuotasCreadas, error: errRpc } = await supabase.rpc('create_expense_installments', {
        p_descripcion: descripcionBase,
        p_monto_total: montoNumero,
        p_cuotas: cuotas,
        p_fecha_primera_cuota: gasto.primeraCuota,
        // ?? en vez de || — evita colapsar id_categoria/id_metodo_pago = 0 a null (fix C-02).
        p_id_categoria: gasto.id_categoria ?? null,
        p_id_metodo_pago: gasto.id_metodo_pago ?? null,
        // Se pasa explícito en vez de confiar en el DEFAULT true del RPC — el
        // front hoy siempre fuerza es_fijo: true para tarjeta/préstamo, pero
        // la firma de la función no debe depender de esa coincidencia (fix
        // migrations/20260810_fix_create_expense_installments_es_fijo.sql).
        p_es_fijo: Boolean(gasto.es_fijo),
    });

    if (errRpc) {
        console.error('❌ Error en create_expense_installments:', errRpc);
        throw errRpc;
    }
    if (!cuotasCreadas?.length) throw new Error('No se pudo guardar el gasto. Verificá tu conexión o permisos.');

    // La función retorna todas las cuotas ordenadas por numero_cuota — la primera es el padre.
    return cuotasCreadas[0];
};

/**
 * Obtiene todos los gastos pagados con tarjeta de crédito del usuario,
 * sin filtro de mes, para el panel de seguimiento de cuotas.
 * Los agrupa por id_gasto_padre para mostrar el estado de cada compra.
 *
 * @returns {Array} Grupos de cuotas: [{ descripcionBase, totalOriginal, cuotas, pagadas, pendientes, montoMensual, cuotasList }]
 */
export const getTarjetasEnCuotas = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            id, descripcion, monto, fecha, cuotas, numero_cuota, id_gasto_padre,
            categorias:id_categoria (id, nombre, es_prestamo),
            metodos_pago:id_metodo_pago (id, nombre, acepta_cuotas)
        `)
        .eq('user_id', usuario.id)
        .not('id_gasto_padre', 'is', null)
        .order('id_gasto_padre', { ascending: true })
        .order('numero_cuota', { ascending: true });

    if (error) throw error;

    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    const mesCorrienteInicio = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
    const mesCorrienteFin = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-31`;

    const grupos = agruparPorPadre(filtrarTarjetaCredito(data ?? []));

    return Object.values(grupos)
        .map(c => transformarGrupoCuotas(c, hoyStr, mesCorrienteInicio, mesCorrienteFin))
        .sort((a, b) => a.pendientes - b.pendientes || a.descripcionBase.localeCompare(b.descripcionBase));
};

/**
 * Obtiene todos los préstamos en cuotas del usuario, agrupados por id_gasto_padre.
 * Filtra por categoría PRESTAMOS en lugar de método de pago.
 *
 * @returns {Array} Grupos de cuotas: [{ descripcionBase, totalOriginal, cuotas, pagadas, pendientes, montoMensual, cuotasList }]
 */
export const getPrestamosEnCuotas = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            id, descripcion, monto, fecha, cuotas, numero_cuota, id_gasto_padre,
            categorias:id_categoria (id, nombre, es_prestamo),
            metodos_pago:id_metodo_pago (id, nombre, acepta_cuotas)
        `)
        .eq('user_id', usuario.id)
        .not('id_gasto_padre', 'is', null)
        .order('id_gasto_padre', { ascending: true })
        .order('numero_cuota', { ascending: true });

    if (error) throw error;

    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    const mesCorrienteInicio = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
    const mesCorrienteFin = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-31`;

    const grupos = agruparPorPadre(filtrarPrestamos(data ?? []));

    return Object.values(grupos)
        .map(c => transformarGrupoCuotas(c, hoyStr, mesCorrienteInicio, mesCorrienteFin))
        .sort((a, b) => a.pendientes - b.pendientes || a.descripcionBase.localeCompare(b.descripcionBase));
};

/**
 * Obtiene los préstamos en cuotas futuros (mes siguiente en adelante),
 * agrupados por id_gasto_padre.
 *
 * @returns {Array} Grupos con las cuotas pendientes de cada préstamo
 */
export const getPrestamosGastosFuturos = async () => {
    const usuario = await obtenerUsuarioActivo();

    const hoy = new Date();
    const { anio, mes, desde: mesSigInicio, hasta: mesSigFin } = calcularMesSiguiente(hoy.getFullYear(), hoy.getMonth() + 1);
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            id, descripcion, monto, fecha, cuotas, numero_cuota, id_gasto_padre,
            categorias:id_categoria (id, nombre, es_prestamo),
            metodos_pago:id_metodo_pago (id, nombre, acepta_cuotas)
        `)
        .eq('user_id', usuario.id)
        .not('id_gasto_padre', 'is', null)
        .gte('fecha', desde)
        .order('id_gasto_padre', { ascending: true })
        .order('numero_cuota', { ascending: true });

    if (error) throw error;

    const grupos = agruparPorPadre(filtrarPrestamos(data ?? []));

    return Object.values(grupos)
        .map(c => transformarGrupoCuotasFuturas(c, mesSigInicio, mesSigFin))
        .sort((a, b) => a.cuotasFuturas[0]?.fecha?.localeCompare(b.cuotasFuturas[0]?.fecha));
};

/**
 * Obtiene las cuotas futuras (mes siguiente en adelante) de compras con tarjeta de crédito,
 * agrupadas por id_gasto_padre. Usado en la sección "Movimientos Futuros".
 *
 * @returns {Array} Grupos con las cuotas pendientes de cada compra
 */
export const getGastosFuturos = async () => {
    const usuario = await obtenerUsuarioActivo();

    // Primer día del mes siguiente como límite inferior
    const hoy = new Date();
    const { anio, mes, desde: mesSigInicio, hasta: mesSigFin } = calcularMesSiguiente(hoy.getFullYear(), hoy.getMonth() + 1);
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            id, descripcion, monto, fecha, cuotas, numero_cuota, id_gasto_padre,
            categorias:id_categoria (id, nombre, es_prestamo),
            metodos_pago:id_metodo_pago (id, nombre, acepta_cuotas)
        `)
        .eq('user_id', usuario.id)
        .not('id_gasto_padre', 'is', null)
        .gte('fecha', desde)
        .order('id_gasto_padre', { ascending: true })
        .order('numero_cuota', { ascending: true });

    if (error) throw error;

    const gruposTarjeta = agruparPorPadre(filtrarTarjetaCredito(data ?? []));

    return Object.values(gruposTarjeta)
        .map(c => transformarGrupoCuotasFuturas(c, mesSigInicio, mesSigFin))
        .sort((a, b) => a.cuotasFuturas[0]?.fecha?.localeCompare(b.cuotasFuturas[0]?.fecha));
};

/**
 * Elimina todas las cuotas de una compra en tarjeta de crédito.
 * Borra todos los registros que comparten el mismo id_gasto_padre (incluido el padre).
 *
 * @param {number} idGastoPadre - ID del gasto raíz de la compra en cuotas
 */
export const deleteExpenseGroup = async (idGastoPadre) => {
    if (!idGastoPadre) throw new Error('ID de grupo inválido');

    const usuario = await obtenerUsuarioActivo();

    // El padre tiene id_gasto_padre = id (autoref), por lo que este único delete
    // elimina tanto el padre como todos sus hijos en una sola operación atómica.
    const { error } = await supabase
        .from('gastos')
        .delete()
        .eq('user_id', usuario.id)
        .eq('id_gasto_padre', idGastoPadre);

    if (error) throw error;
};

/**
 * Actualiza descripción, categoría y/o fecha de inicio de todos los registros
 * de una compra en cuotas. Recalcula las fechas de cada cuota a partir de la nueva fecha base.
 *
 * @param {number} idGastoPadre - ID del gasto raíz
 * @param {Object} cambios - { descripcion?, idCategoria?, fechaInicio? }
 */
export const updateExpenseGroup = async (idGastoPadre, { descripcion, idCategoria, fechaInicio }) => {
    if (!idGastoPadre) throw new Error('ID de grupo inválido');

    const usuario = await obtenerUsuarioActivo();

    // Traer todas las cuotas del grupo ordenadas para recalcular fechas
    const { data, error } = await supabase
        .from('gastos')
        .select('id, numero_cuota, descripcion')
        .eq('user_id', usuario.id)
        .eq('id_gasto_padre', idGastoPadre)
        .order('numero_cuota', { ascending: true });

    if (error) throw error;

    const cuotas = data ?? [];
    const totalCuotas = cuotas.length;

    // Fecha base para recalcular: si no se provee, usamos la fecha actual de la primera cuota
    const fechaBase = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : null;

    const actualizaciones = cuotas.map(c => {
        const update = {};

        if (descripcion !== undefined) {
            const descBase = descripcion.trim().toUpperCase();
            update.descripcion = totalCuotas > 1
                ? `${descBase} (${c.numero_cuota}/${totalCuotas})`
                : descBase;
        }

        if (idCategoria !== undefined) {
            update.id_categoria = idCategoria;
        }

        if (fechaBase) {
            const nuevaFecha = new Date(fechaBase);
            // numero_cuota arranca en 1; la primera cuota no desplaza, la segunda desplaza 1 mes, etc.
            nuevaFecha.setMonth(fechaBase.getMonth() + (c.numero_cuota - 1));
            update.fecha = nuevaFecha.toISOString().split('T')[0];
        }

        return { id: c.id, ...update };
    });

    // Updates en paralelo — Supabase devuelve { error } en lugar de lanzar, por eso
    // recolectamos todos los resultados y buscamos el primer error al final.
    // La consistencia es equivalente al loop anterior: tampoco había rollback.
    const resultados = await Promise.all(
        actualizaciones.map(({ id, ...fields }) =>
            supabase
                .from('gastos')
                .update(fields)
                .eq('id', id)
                .eq('user_id', usuario.id)
        )
    );
    const primerError = resultados.find(r => r.error);
    if (primerError) throw primerError.error;
};

/**
 * Actualiza un gasto existente por su ID.
 * Solo actualiza los campos editables (no el user_id ni el id).
 *
 * @param {string} id - ID del gasto a actualizar
 * @param {Object} gasto - Nuevos datos del gasto
 * @returns {Object} El gasto actualizado
 * @throws {Error} Si el monto no es válido o es ≤ 0
 */
export const updateExpense = async (id, gasto) => {
    if (!id || (typeof id !== 'string' && typeof id !== 'number')) {
        throw new Error('ID de gasto inválido');
    }

    const usuario = await obtenerUsuarioActivo();

    if (gasto.monto !== undefined) validarMonto(gasto.monto);

    // Validar fecha si se proporciona — previene fechas arbitrarias que corrompen estadísticas
    if (gasto.fecha !== undefined) {
        const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
        const d = new Date(gasto.fecha);
        if (!fechaRegex.test(gasto.fecha) || isNaN(d.getTime()) || d.getFullYear() > 2100) {
            throw new Error('Fecha inválida');
        }
    }

    const { data, error } = await supabase
        .from('gastos')
        .update({
            descripcion: gasto.descripcion ? gasto.descripcion.trim().toUpperCase() : undefined,
            monto: gasto.monto !== undefined ? Number(gasto.monto) : undefined,
            id_categoria: gasto.id_categoria !== undefined ? gasto.id_categoria : undefined,
            id_metodo_pago: gasto.id_metodo_pago !== undefined ? gasto.id_metodo_pago : undefined,
            ...(gasto.fecha !== undefined ? { fecha: gasto.fecha } : {}),
            // Solo incluir es_fijo si viene definido explícitamente para no pisar el valor existente
            ...(gasto.es_fijo !== undefined ? { es_fijo: Boolean(gasto.es_fijo) } : {}),
        })
        .eq('id', id)
        .eq('user_id', usuario.id)
        .select()
        .single();

    if (error) {
        console.error('❌ Error en updateExpense:', error);
        throw error;
    }
    return data;
};

/**
 * Elimina un gasto por su ID.
 *
 * @param {string} id - ID del gasto a eliminar
 */
export const deleteExpense = async (id) => {
    if (!id || (typeof id !== 'string' && typeof id !== 'number')) {
        throw new Error('ID de gasto inválido');
    }

    const usuario = await obtenerUsuarioActivo();

    const { error } = await supabase
        .from('gastos')
        .delete()
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) throw error;
};
