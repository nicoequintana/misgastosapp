import { supabase } from './supabase';
import { fechaHoyArgentina } from '../utils/format';
import { calcularCuotas } from './cuotasHelper';

/**
 * Capa de acceso a datos (Data Access Layer) para Supabase.
 * 
 * Cada función interactúa con una tabla específica. Las políticas RLS
 * de Supabase filtran automáticamente por user_id en las consultas de
 * lectura/escritura. Para inserciones, pasamos el user_id explícitamente.
 * 
 * Convención de errores: todas las funciones hacen throw del error
 * para que el llamador (service/hook) pueda manejarlo apropiadamente.
 */

// ==================== HELPERS INTERNOS ====================

/**
 * Obtiene el usuario autenticado actual.
 * Lanza un error descriptivo si no hay sesión activa.
 * 
 * @returns {Object} Objeto de usuario de Supabase
 * @throws {Error} Si no hay sesión activa
 */
const obtenerUsuarioActivo = async () => {
    // getSession() lee desde caché local (sin request HTTP).
    // getUser() valida contra el servidor cada vez — innecesario aquí
    // porque RLS en Supabase valida el JWT en cada query de todas formas.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
        throw new Error('No hay sesión de usuario activa. Por favor, iniciá sesión nuevamente.');
    }

    return user;
};

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
    const mesSiguiente = hoy.getMonth() === 11 ? 1 : hoy.getMonth() + 2;
    const anioSiguiente = hoy.getMonth() === 11 ? anio + 1 : anio;
    const desde = `${anio}-${mes}-01`;
    const hasta = `${anioSiguiente}-${String(mesSiguiente).padStart(2, '0')}-01`;

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            *,
            categorias:id_categoria (id, nombre),
            metodos_pago:id_metodo_pago (id, nombre)
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

    if (typeof gasto.descripcion !== 'string' || !gasto.descripcion.trim()) {
        throw new Error('La descripción debe ser un texto válido');
    }

    const montoNumero = Number(gasto.monto);
    if (isNaN(montoNumero) || montoNumero <= 0) {
        throw new Error('El monto debe ser mayor a cero');
    }

    const esTarjetaCredito = gasto.esTarjetaCredito === true;
    const cuotas = esTarjetaCredito ? Math.max(1, Math.min(18, parseInt(gasto.cuotas) || 1)) : 1;
    const descripcionBase = gasto.descripcion.trim().toUpperCase();

    if (!esTarjetaCredito) {
        // Gasto normal: inserción única
        const { data, error } = await supabase
            .from('gastos')
            .insert([{
                user_id: usuario.id,
                descripcion: descripcionBase,
                monto: montoNumero,
                id_categoria: gasto.id_categoria || null,
                id_metodo_pago: gasto.id_metodo_pago || null,
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
        return data;
    }

    // Gasto con tarjeta de crédito: se difiere al mes siguiente y se generan N cuotas fijas.
    const cuotasCalculadas = calcularCuotas(
        montoNumero,
        cuotas,
        gasto.fecha || fechaHoyArgentina(),
        descripcionBase
    );

    const registros = cuotasCalculadas.map(c => ({
        user_id:        usuario.id,
        descripcion:    c.descripcion,
        monto:          c.monto,
        id_categoria:   gasto.id_categoria || null,
        id_metodo_pago: gasto.id_metodo_pago || null,
        fecha:          c.fecha,
        es_fijo:        true,
        cuotas,
        numero_cuota:   c.numero,
        id_gasto_padre: null, // se actualiza después del insert del primer registro
    }));

    // Insertamos la primera cuota sola para obtener su ID como padre
    const { data: primero, error: errPrimero } = await supabase
        .from('gastos')
        .insert([registros[0]])
        .select()
        .single();

    if (errPrimero) {
        console.error('❌ Error al insertar primera cuota:', errPrimero);
        throw errPrimero;
    }

    // Siempre vinculamos la primera cuota a sí misma como padre para que
    // getTarjetasEnCuotas pueda encontrarla (filtra por id_gasto_padre != null).
    await supabase
        .from('gastos')
        .update({ id_gasto_padre: primero.id })
        .eq('id', primero.id);

    if (cuotas === 1) return { ...primero, id_gasto_padre: primero.id };

    // Las cuotas 2..N apuntan al primer registro como padre
    const restantes = registros.slice(1).map(r => ({ ...r, id_gasto_padre: primero.id }));

    const { error: errRestantes } = await supabase
        .from('gastos')
        .insert(restantes);

    if (errRestantes) {
        console.error('❌ Error al insertar cuotas restantes:', errRestantes);
        throw errRestantes;
    }

    return primero;
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
            categorias:id_categoria (id, nombre),
            metodos_pago:id_metodo_pago (id, nombre)
        `)
        .eq('user_id', usuario.id)
        .not('id_gasto_padre', 'is', null)
        .ilike('metodos_pago.nombre', 'TARJETA DE CREDITO')
        .order('id_gasto_padre', { ascending: true })
        .order('numero_cuota', { ascending: true });

    if (error) throw error;

    // Filtramos en cliente para asegurarnos que solo vienen gastos con tarjeta de crédito,
    // ya que el filtro .ilike sobre una relación puede no funcionar en todos los casos con Supabase.
    const soloTarjeta = (data ?? []).filter(g =>
        g.metodos_pago?.nombre?.toUpperCase() === 'TARJETA DE CREDITO'
    );

    // Agrupar por id_gasto_padre
    const grupos = soloTarjeta.reduce((acc, g) => {
        const padreId = g.id_gasto_padre;
        if (!acc[padreId]) acc[padreId] = [];
        acc[padreId].push(g);
        return acc;
    }, {});

    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];

    return Object.values(grupos).map(cuotas => {
        const ordenadas = cuotas.sort((a, b) => a.numero_cuota - b.numero_cuota);
        const primera = ordenadas[0];
        // Descripción sin el sufijo "(1/N)"
        const descripcionBase = primera.descripcion.replace(/\s*\(\d+\/\d+\)$/, '');
        const totalOriginal = ordenadas.reduce((s, c) => s + parseFloat(c.monto || 0), 0);
        const pagadas = ordenadas.filter(c => c.fecha.split('T')[0] <= hoyStr).length;

        return {
            id: primera.id_gasto_padre,
            descripcionBase,
            categoria: primera.categorias?.nombre || '—',
            totalOriginal,
            cuotas: ordenadas.length,
            pagadas,
            pendientes: ordenadas.length - pagadas,
            montoMensual: parseFloat(primera.monto || 0),
            cuotasList: ordenadas,
        };
    }).sort((a, b) => a.pendientes - b.pendientes || a.descripcionBase.localeCompare(b.descripcionBase));
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
    const anio = hoy.getMonth() === 11 ? hoy.getFullYear() + 1 : hoy.getFullYear();
    const mes = hoy.getMonth() === 11 ? 1 : hoy.getMonth() + 2;
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            id, descripcion, monto, fecha, cuotas, numero_cuota, id_gasto_padre,
            categorias:id_categoria (id, nombre),
            metodos_pago:id_metodo_pago (id, nombre)
        `)
        .eq('user_id', usuario.id)
        .not('id_gasto_padre', 'is', null)
        .gte('fecha', desde)
        .order('id_gasto_padre', { ascending: true })
        .order('numero_cuota', { ascending: true });

    if (error) throw error;

    const soloTarjeta = (data ?? []).filter(
        g => g.metodos_pago?.nombre?.toUpperCase() === 'TARJETA DE CREDITO'
    );

    const grupos = soloTarjeta.reduce((acc, g) => {
        const k = g.id_gasto_padre;
        if (!acc[k]) acc[k] = [];
        acc[k].push(g);
        return acc;
    }, {});

    return Object.values(grupos).map(cuotas => {
        const ordenadas = cuotas.sort((a, b) => (a.numero_cuota ?? 0) - (b.numero_cuota ?? 0));
        const primera = ordenadas[0];
        const descripcionBase = primera.descripcion.replace(/\s*\(\d+\/\d+\)$/, '');
        return {
            id: primera.id_gasto_padre,
            descripcionBase,
            categoria: primera.categorias?.nombre || '—',
            idCategoria: primera.categorias?.id || null,
            montoMensual: parseFloat(primera.monto || 0),
            cuotasFuturas: ordenadas,
        };
    }).sort((a, b) => a.cuotasFuturas[0]?.fecha?.localeCompare(b.cuotasFuturas[0]?.fecha));
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

    // El CASCADE en la FK elimina los hijos, pero eliminamos todos explícitamente
    // para no depender de que el FK CASCADE esté activo en todas las instancias.
    const { error } = await supabase
        .from('gastos')
        .delete()
        .eq('user_id', usuario.id)
        .eq('id_gasto_padre', idGastoPadre);

    if (error) throw error;

    // Eliminar también el registro padre
    const { error: errPadre } = await supabase
        .from('gastos')
        .delete()
        .eq('user_id', usuario.id)
        .eq('id', idGastoPadre);

    if (errPadre) throw errPadre;
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

    // Actualizar en paralelo
    await Promise.all(
        actualizaciones.map(({ id, ...fields }) =>
            supabase
                .from('gastos')
                .update(fields)
                .eq('id', id)
                .eq('user_id', usuario.id)
        )
    );
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

    // Validar monto si se proporciona
    if (gasto.monto !== undefined) {
        const montoNumero = Number(gasto.monto);
        if (isNaN(montoNumero) || montoNumero <= 0) {
            throw new Error('El monto debe ser mayor a cero');
        }
    }

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

/**
 * Elimina todos los gastos NO fijos del usuario autenticado.
 * Útil para el "reseteo mensual" de gastos variables.
 * RLS garantiza que solo se borren los gastos del usuario actual.
 */
export const deleteVariableExpenses = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { error } = await supabase
        .from('gastos')
        .delete()
        .eq('user_id', usuario.id)
        .eq('es_fijo', false);

    if (error) throw error;
};

// ==================== CATEGORÍAS ====================

/**
 * Obtiene las categorías visibles para el usuario:
 * - Categorías globales (user_id IS NULL)
 * - Categorías propias del usuario autenticado
 * Las RLS de Supabase se encargan del filtro — esta consulta trae todo lo permitido.
 *
 * @returns {Array} Lista de categorías ordenadas alfabéticamente, con flag `es_propia`
 */
export const getCategories = async () => {
    const usuario = await obtenerUsuarioActivo();

    // Traemos globales (user_id IS NULL) y propias del usuario autenticado
    const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .or(`user_id.is.null,user_id.eq.${usuario.id}`)
        .order('nombre');

    if (error) throw error;

    // Marcamos cuáles son propias del usuario para que la UI pueda mostrar opciones de borrado
    return (data ?? []).map(cat => ({
        ...cat,
        es_propia: cat.user_id === usuario.id,
    }));
};

/**
 * Crea una nueva categoría personal para el usuario autenticado.
 * Las categorías personales son visibles solo para ese usuario.
 *
 * @param {string} nombre - Nombre de la categoría (se normaliza a mayúsculas)
 * @returns {Object} La categoría creada
 * @throws {Error} Si el nombre está vacío o ya existe una categoría con ese nombre
 */
export const createCategory = async (nombre) => {
    const usuario = await obtenerUsuarioActivo();

    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre de la categoría no puede estar vacío');
    }

    const nombreNormalizado = nombre.trim().toUpperCase();

    const { data, error } = await supabase
        .from('categorias')
        .insert([{ nombre: nombreNormalizado, user_id: usuario.id }])
        .select()
        .single();

    if (error) {
        console.error('❌ Error en createCategory:', error);
        throw error;
    }

    return { ...data, es_propia: true };
};

/**
 * Elimina una categoría personal del usuario autenticado.
 * Solo se pueden eliminar categorías propias (user_id = auth.uid()).
 * Las RLS impiden eliminar categorías globales o de otros usuarios.
 *
 * @param {number} id - ID de la categoría a eliminar
 * @throws {Error} Si la categoría tiene gastos asociados (FK constraint) o no es propia
 */
export const deleteCategory = async (id) => {
    const usuario = await obtenerUsuarioActivo();

    const { error } = await supabase
        .from('categorias')
        .delete()
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) {
        console.error('❌ Error en deleteCategory:', error);
        throw error;
    }
};

/**
 * Obtiene todos los métodos de pago.
 * Ahora son globales y vienen pre-configurados en Supabase.
 * 
 * @returns {Array} Lista de métodos de pago ordenados alfabéticamente
 */
export const getPaymentMethods = async () => {
    const { data, error } = await supabase
        .from('metodos_pago')
        .select('*')
        .order('nombre');

    if (error) throw error;
    return data ?? [];
};


// ==================== INGRESOS ====================

/**
 * Obtiene todos los ingresos del usuario en un mes/año específico.
 * Ordenados por fecha descendente.
 *
 * @param {number} year  - Año (ej: 2026)
 * @param {number} month - Mes 1-indexado (1=enero … 12=diciembre)
 * @returns {Array} Lista de ingresos del período, con datos de categoría
 */
export const getIncomesByMonth = async (year, month) => {
    const usuario = await obtenerUsuarioActivo();

    const mesStr        = String(month).padStart(2, '0');
    const mesSigNum     = month === 12 ? 1  : month + 1;
    const anioSig       = month === 12 ? year + 1 : year;
    const mesSigStr     = String(mesSigNum).padStart(2, '0');
    const desde         = `${year}-${mesStr}-01`;
    const hasta         = `${anioSig}-${mesSigStr}-01`;

    const { data, error } = await supabase
        .from('ingresos')
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .eq('user_id', usuario.id)
        .gte('fecha', desde)
        .lt('fecha', hasta)
        .order('fecha', { ascending: false });

    if (error) {
        console.error('❌ Error en getIncomesByMonth:', error);
        throw error;
    }

    return data ?? [];
};

/**
 * Retorna la suma de ingresos del usuario para un mes/año.
 * Devuelve 0 si no hay registros en ese período.
 *
 * @param {number} year
 * @param {number} month
 * @returns {number} Total de ingresos del período
 */
export const getIncomeTotalByMonth = async (year, month) => {
    const ingresos = await getIncomesByMonth(year, month);
    return ingresos.reduce((suma, i) => suma + parseFloat(i.monto || 0), 0);
};

/**
 * Crea un nuevo ingreso para el usuario.
 * No permite fechas anteriores al mes actual (bloquea cargar hacia atrás).
 *
 * @param {Object} data
 * @param {number} data.monto       - Monto del ingreso (obligatorio, > 0)
 * @param {string} data.fecha       - Fecha YYYY-MM-DD (obligatorio, no puede ser mes anterior)
 * @param {string} [data.descripcion]
 * @param {number} [data.categoria_id]
 * @returns {Object} El ingreso creado
 */
export const createIncome = async ({ monto, fecha, descripcion, categoria_id }) => {
    const usuario = await obtenerUsuarioActivo();

    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
        throw new Error('El ingreso debe ser mayor a cero');
    }

    // Validar que la fecha no sea de un mes anterior al actual
    const hoy        = new Date();
    const periodoMin = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fechaIngreso = new Date(`${fecha}T12:00:00`);
    if (fechaIngreso < periodoMin) {
        throw new Error('No podés registrar ingresos en meses anteriores al actual');
    }

    const payload = {
        user_id:     usuario.id,
        monto:       montoNum,
        fecha,
        origen:      'manual',
        fecha_creacion:     new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString(),
    };
    if (descripcion?.trim()) payload.descripcion = descripcion.trim();
    if (categoria_id)        payload.categoria_id = categoria_id;

    const { data, error } = await supabase
        .from('ingresos')
        .insert(payload)
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .single();

    if (error) {
        console.error('❌ Error en createIncome:', error);
        throw error;
    }

    return data;
};

/**
 * Actualiza un ingreso existente del usuario.
 * No permite mover el ingreso a un mes anterior al actual.
 *
 * @param {number} id    - ID del ingreso a actualizar
 * @param {Object} data  - Campos a actualizar: monto, fecha, descripcion, categoria_id
 * @returns {Object} El ingreso actualizado
 */
export const updateIncome = async (id, { monto, fecha, descripcion, categoria_id }) => {
    const usuario = await obtenerUsuarioActivo();

    if (monto !== undefined) {
        const montoNum = Number(monto);
        if (isNaN(montoNum) || montoNum <= 0) throw new Error('El monto debe ser mayor a cero');
    }

    if (fecha) {
        const hoy        = new Date();
        const periodoMin = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const fechaIngreso = new Date(`${fecha}T12:00:00`);
        if (fechaIngreso < periodoMin) {
            throw new Error('No podés mover un ingreso a un mes anterior al actual');
        }
    }

    const payload = { fecha_actualizacion: new Date().toISOString() };
    if (monto       !== undefined) payload.monto       = Number(monto);
    if (fecha       !== undefined) payload.fecha       = fecha;
    if (descripcion !== undefined) payload.descripcion = descripcion?.trim() || null;
    if (categoria_id !== undefined) payload.categoria_id = categoria_id || null;

    const { data, error } = await supabase
        .from('ingresos')
        .update(payload)
        .eq('id', id)
        .eq('user_id', usuario.id)
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .single();

    if (error) {
        console.error('❌ Error en updateIncome:', error);
        throw error;
    }

    return data;
};

/**
 * Elimina un ingreso del usuario por ID.
 * RLS garantiza que solo puede eliminar los propios.
 *
 * @param {number} id - ID del ingreso a eliminar
 */
export const deleteIncome = async (id) => {
    const usuario = await obtenerUsuarioActivo();

    const { error } = await supabase
        .from('ingresos')
        .delete()
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) {
        console.error('❌ Error en deleteIncome:', error);
        throw error;
    }
};

/**
 * Obtiene todas las categorías de ingresos disponibles para el usuario.
 * Incluye globales (user_id IS NULL) y personales del usuario.
 *
 * @returns {Array} Lista de categorías con flag es_propia
 */
export const getIncomeCategories = async () => {
    const { data, error } = await supabase
        .from('categorias_ingresos')
        .select('*')
        .eq('activa', true)
        .order('nombre');

    if (error) {
        console.error('❌ Error en getIncomeCategories:', error);
        throw error;
    }

    const usuario = await obtenerUsuarioActivo();
    return (data ?? []).map(c => ({ ...c, es_propia: c.user_id === usuario.id }));
};

// Alias para compatibilidad con código antiguo — usa getIncomesByMonth del mes actual
export const getIncome = async () => {
    const hoy = new Date();
    const total = await getIncomeTotalByMonth(hoy.getFullYear(), hoy.getMonth() + 1);
    return { monto: total };
};

// Alias mantenido para compatibilidad — ahora usa createIncome
export const saveIncome = async (monto) => {
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    return createIncome({ monto, fecha });
};

// ==================== INGRESOS RECURRENTES ====================

/**
 * Obtiene todos los ingresos recurrentes del usuario (activos e inactivos).
 */
export const getRecurringIncomes = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('ingresos_recurrentes')
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .eq('user_id', usuario.id)
        .order('fecha_creacion', { ascending: false });

    if (error) {
        console.error('❌ Error en getRecurringIncomes:', error);
        throw error;
    }

    return data ?? [];
};

/**
 * Crea un ingreso recurrente.
 *
 * @param {Object} data
 * @param {string} data.descripcion   - Obligatorio
 * @param {number} data.monto         - Obligatorio, > 0
 * @param {number} [data.categoria_id]
 * @param {number} [data.dia_estimado] - Día del mes esperado (1-31)
 * @param {string} [data.fecha_inicio] - YYYY-MM-DD, default hoy
 */
export const createRecurringIncome = async ({ descripcion, monto, categoria_id, dia_estimado, fecha_inicio }) => {
    const usuario = await obtenerUsuarioActivo();

    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) throw new Error('El monto debe ser mayor a cero');
    if (!descripcion?.trim()) throw new Error('La descripción es obligatoria');

    const hoy = new Date();
    const payload = {
        user_id:     usuario.id,
        descripcion: descripcion.trim().toUpperCase(),
        monto:       montoNum,
        frecuencia:  'mensual',
        activo:      true,
        fecha_inicio: fecha_inicio ?? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`,
    };
    if (categoria_id)  payload.categoria_id  = categoria_id;
    if (dia_estimado)  payload.dia_estimado  = Number(dia_estimado);

    const { data, error } = await supabase
        .from('ingresos_recurrentes')
        .insert(payload)
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .single();

    if (error) {
        console.error('❌ Error en createRecurringIncome:', error);
        throw error;
    }

    return data;
};

/**
 * Actualiza un ingreso recurrente existente.
 *
 * @param {number} id
 * @param {Object} data - Campos a actualizar: descripcion, monto, categoria_id, dia_estimado, activo, fecha_fin
 */
export const updateRecurringIncome = async (id, data) => {
    const usuario = await obtenerUsuarioActivo();

    const payload = { fecha_actualizacion: new Date().toISOString() };
    if (data.descripcion !== undefined) payload.descripcion = data.descripcion.trim().toUpperCase();
    if (data.monto       !== undefined) {
        const m = Number(data.monto);
        if (isNaN(m) || m <= 0) throw new Error('El monto debe ser mayor a cero');
        payload.monto = m;
    }
    if (data.categoria_id  !== undefined) payload.categoria_id  = data.categoria_id  || null;
    if (data.dia_estimado  !== undefined) payload.dia_estimado  = data.dia_estimado  || null;
    if (data.activo        !== undefined) payload.activo        = data.activo;
    if (data.fecha_fin     !== undefined) payload.fecha_fin     = data.fecha_fin     || null;

    const { data: updated, error } = await supabase
        .from('ingresos_recurrentes')
        .update(payload)
        .eq('id', id)
        .eq('user_id', usuario.id)
        .select('*, categorias_ingresos:categoria_id (id, nombre)')
        .single();

    if (error) {
        console.error('❌ Error en updateRecurringIncome:', error);
        throw error;
    }

    return updated;
};

/**
 * Elimina un ingreso recurrente. Solo elimina si no tiene ingresos generados asociados;
 * si los tiene, desactiva (activo = false) para preservar el historial.
 *
 * @param {number} id
 */
export const deleteRecurringIncome = async (id) => {
    const usuario = await obtenerUsuarioActivo();

    // Verificar si tiene ingresos reales generados por este recurrente
    const { count } = await supabase
        .from('ingresos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', usuario.id)
        .eq('recurrente_id', id);

    if (count > 0) {
        // Tiene historial — desactivar en vez de borrar
        return updateRecurringIncome(id, { activo: false, fecha_fin: new Date().toISOString().split('T')[0] });
    }

    const { error } = await supabase
        .from('ingresos_recurrentes')
        .delete()
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) {
        console.error('❌ Error en deleteRecurringIncome:', error);
        throw error;
    }
};

/**
 * Proyecta los ingresos esperados para un mes/año dado, basándose en los
 * ingresos recurrentes activos cuya fecha_inicio sea <= ese mes.
 * No cuenta recurrentes cuya fecha_fin sea anterior al período solicitado.
 * Diferencia la proyección de ingresos reales ya registrados.
 *
 * @param {number} year
 * @param {number} month
 * @returns {{ proyectados: Array, totalProyectado: number, totalReal: number, totalCombinado: number }}
 */
export const getProjectedIncomeByMonth = async (year, month) => {
    const mesStr    = String(month).padStart(2, '0');
    const periodoStr = `${year}-${mesStr}-01`;
    const mesSigNum  = month === 12 ? 1 : month + 1;
    const anioSig    = month === 12 ? year + 1 : year;
    const hasta      = `${anioSig}-${String(mesSigNum).padStart(2, '0')}-01`;

    const [recurrentes, ingresosReales] = await Promise.all([
        getRecurringIncomes(),
        getIncomesByMonth(year, month),
    ]);

    // Filtrar recurrentes que aplican para el período solicitado
    const proyectados = recurrentes.filter(r => {
        if (!r.activo) return false;
        if (r.fecha_inicio > hasta) return false;                          // aún no empezó
        if (r.fecha_fin && r.fecha_fin < periodoStr) return false;         // ya terminó
        return true;
    }).map(r => ({
        id:           r.id,
        descripcion:  r.descripcion,
        monto:        parseFloat(r.monto),
        categoria:    r.categorias_ingresos?.nombre ?? null,
        dia_estimado: r.dia_estimado,
        origen:       'proyectado',
    }));

    const totalProyectado = proyectados.reduce((s, r) => s + r.monto, 0);
    const totalReal       = ingresosReales.reduce((s, i) => s + parseFloat(i.monto || 0), 0);

    return {
        proyectados,
        totalProyectado,
        totalReal,
        // Total combinado: real + lo que falta de la proyección (no duplica lo ya cobrado)
        totalCombinado: totalReal + Math.max(0, totalProyectado - totalReal),
    };
};

/**
 * Compara ingresos y gastos variables entre el mes actual y el anterior.
 *
 * @param {number} year
 * @param {number} month - Mes actual (1-indexado)
 * @returns {{ ingresoActual, ingresoAnterior, variacionIngreso, variacionIngresoPct,
 *             gastosVarActual, gastosVarAnterior, variacionGastos, variacionGastosPct }}
 */
export const getMonthlyComparison = async (year, month) => {
    const mesAntNum  = month === 1 ? 12 : month - 1;
    const anioAnt    = month === 1 ? year - 1 : year;

    const [ingresoActual, ingresoAnterior, statsActual, statsAnterior] = await Promise.all([
        getIncomeTotalByMonth(year, month),
        getIncomeTotalByMonth(anioAnt, mesAntNum),
        getStatsByMonth(year, month),
        getStatsByMonth(anioAnt, mesAntNum),
    ]);

    const gastosVarActual   = statsActual.gastosVariables   ?? 0;
    const gastosVarAnterior = statsAnterior.gastosVariables ?? 0;

    const variacionIngreso    = ingresoActual - ingresoAnterior;
    const variacionIngresoPct = ingresoAnterior > 0
        ? ((variacionIngreso / ingresoAnterior) * 100)
        : null;

    const variacionGastos    = gastosVarActual - gastosVarAnterior;
    const variacionGastosPct = gastosVarAnterior > 0
        ? ((variacionGastos / gastosVarAnterior) * 100)
        : null;

    return {
        ingresoActual,
        ingresoAnterior,
        variacionIngreso,
        variacionIngresoPct,
        gastosVarActual,
        gastosVarAnterior,
        variacionGastos,
        variacionGastosPct,
    };
};

// ==================== PERFIL DE USUARIO ====================

/**
 * Obtiene el perfil del usuario autenticado desde la tabla usuarios.
 * Incluye el theme_id persistido.
 *
 * @returns {Object|null} Perfil del usuario o null si no existe aún
 */
export const getPerfilUsuario = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', usuario.id)
        .maybeSingle();

    if (error) {
        console.error('❌ Error en getPerfilUsuario:', error);
        throw error;
    }

    return data;
};

/**
 * Actualiza el theme_id del usuario autenticado.
 * Solo toca la columna theme_id para no pisar otros datos del perfil.
 *
 * @param {string} themeId - ID del tema a guardar (ej: 'dark-ocean', 'light-azure')
 * @returns {Object} Perfil actualizado
 */
export const updateThemeUsuario = async (themeId) => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('usuarios')
        .update({ theme_id: themeId, ultima_actualizacion: new Date().toISOString() })
        .eq('id', usuario.id)
        .select()
        .single();

    if (error) {
        console.error('❌ Error en updateThemeUsuario:', error);
        throw error;
    }

    return data;
};

// ==================== ESTADÍSTICAS ====================

/**
 * Calcula las estadísticas financieras consolidadas del usuario.
 * Obtiene gastos e ingresos en paralelo para mejor performance.
 * 
 * @returns {Object} Objeto con totales, saldo, desglose y lista de gastos
 * @example
 * const stats = await getStats();
 * // { totalGastos, gastosFijos, gastosVariables, saldoDisponible,
 * //   ingresoMensual, gastos, porCategoria }
 */
export const getStats = async () => {
    const hoy  = new Date();
    const year  = hoy.getFullYear();
    const month = hoy.getMonth() + 1;

    // Gastos e ingresos del mes actual en paralelo
    const [gastos, ingresoMensual] = await Promise.all([
        getExpenses(),
        getIncomeTotalByMonth(year, month),
    ]);

    const totalGastos     = gastos.reduce((suma, g) => suma + parseFloat(g.monto || 0), 0);
    const gastosFijos     = gastos.filter(g => g.es_fijo).reduce((suma, g) => suma + parseFloat(g.monto || 0), 0);
    const gastosVariables = totalGastos - gastosFijos;
    const saldoDisponible = ingresoMensual - totalGastos;

    const porCategoria = gastos.reduce((acc, gasto) => {
        const nombre = gasto.categorias?.nombre || 'Sin categoría';
        if (!acc[nombre]) acc[nombre] = { total: 0, cantidad: 0 };
        acc[nombre].total    += parseFloat(gasto.monto || 0);
        acc[nombre].cantidad += 1;
        return acc;
    }, {});

    return {
        totalGastos,
        gastosFijos,
        gastosVariables,
        saldoDisponible,
        ingresoMensual,
        gastos,
        porCategoria,
    };
};

/**
 * Obtiene todos los gastos de un rango de fechas arbitrario.
 * Base para el módulo de reportes: filtra por desde/hasta inclusive.
 *
 * @param {string} desde - Fecha 'YYYY-MM-DD' inicio
 * @param {string} hasta - Fecha 'YYYY-MM-DD' fin
 * @returns {Array} Lista de gastos con datos de categoría y método de pago
 */
export const getGastosByRango = async (desde, hasta) => {
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRegex.test(desde) || !fechaRegex.test(hasta)) {
        throw new Error('Formato de fecha inválido. Use YYYY-MM-DD');
    }

    const usuario = await obtenerUsuarioActivo();

    // Comparamos solo la parte de fecha (YYYY-MM-DD) para evitar desfases UTC vs local.
    // La columna 'fecha' puede tener timestamp — usamos cast a date para comparar correctamente.
    const diaSigniente = new Date(`${hasta}T00:00:00`);
    diaSigniente.setDate(diaSigniente.getDate() + 1);
    const hastaExclusivo = diaSigniente.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            *,
            categorias:id_categoria (id, nombre),
            metodos_pago:id_metodo_pago (id, nombre)
        `)
        .eq('user_id', usuario.id)
        .gte('fecha', desde)
        .lt('fecha', hastaExclusivo)
        .order('fecha', { ascending: false });

    if (error) throw error;
    return data ?? [];
};

/**
 * Calcula estadísticas completas para un rango de fechas.
 * Incluye totales, desglose por categoría, por método de pago y evolución diaria.
 * Diseñado para alimentar el módulo de Reportes.
 *
 * @param {string} desde - Fecha 'YYYY-MM-DD' inicio
 * @param {string} hasta - Fecha 'YYYY-MM-DD' fin
 * @returns {Object} { gastos, totalGastos, gastosFijos, gastosVariables, ingresoMensual, porCategoria, porMetodoPago, porDia }
 */
export const getReporteByRango = async (desde, hasta) => {
    const [gastos, ingreso] = await Promise.all([
        getGastosByRango(desde, hasta),
        // Ingresos del mes al que pertenece el rango (usa el mes de inicio del rango)
        getIncomeTotalByMonth(
            parseInt(desde.substring(0, 4)),
            parseInt(desde.substring(5, 7))
        ).then(total => ({ monto: total })),
    ]);

    const totalGastos     = gastos.reduce((s, g) => s + parseFloat(g.monto || 0), 0);
    const gastosFijos     = gastos.filter(g => g.es_fijo).reduce((s, g) => s + parseFloat(g.monto || 0), 0);
    const gastosVariables = totalGastos - gastosFijos;

    // Desglose por categoría con porcentaje sobre el total
    const porCategoria = gastos.reduce((acc, g) => {
        const nombre = g.categorias?.nombre || 'Sin categoría';
        if (!acc[nombre]) acc[nombre] = { total: 0, cantidad: 0, porcentaje: 0 };
        acc[nombre].total    += parseFloat(g.monto || 0);
        acc[nombre].cantidad += 1;
        return acc;
    }, {});
    Object.values(porCategoria).forEach(c => {
        c.porcentaje = totalGastos > 0 ? (c.total / totalGastos) * 100 : 0;
    });

    // Desglose por método de pago
    const porMetodoPago = gastos.reduce((acc, g) => {
        const nombre = g.metodos_pago?.nombre || 'Sin método';
        if (!acc[nombre]) acc[nombre] = { total: 0, cantidad: 0 };
        acc[nombre].total    += parseFloat(g.monto || 0);
        acc[nombre].cantidad += 1;
        return acc;
    }, {});

    // Evolución diaria para el gráfico de barras
    const porDia = gastos.reduce((acc, g) => {
        const fecha = (g.fecha || '').split('T')[0];
        if (!acc[fecha]) acc[fecha] = { total: 0, cantidad: 0 };
        acc[fecha].total    += parseFloat(g.monto || 0);
        acc[fecha].cantidad += 1;
        return acc;
    }, {});

    return {
        gastos,
        totalGastos,
        gastosFijos,
        gastosVariables,
        ingresoMensual: ingreso?.monto || 0,
        porCategoria,
        porMetodoPago,
        porDia,
    };
};

/**
 * Calcula estadísticas de gastos para un mes y año específicos.
 * Útil para comparar el mes actual contra el anterior en alertas de Fase 4.
 *
 * @param {number} year  - Año (ej: 2025)
 * @param {number} month - Mes 1-indexado (1=enero ... 12=diciembre)
 * @returns {Object} { totalGastos, gastosFijos, gastosVariables, gastosFijosLista, porCategoria }
 */
export const getStatsByMonth = async (year, month) => {
    const usuario = await obtenerUsuarioActivo();

    // Construimos las fechas como strings YYYY-MM-DD para evitar desfases UTC en Argentina (UTC-3).
    const mesStr = String(month).padStart(2, '0');
    const mesSiguienteNum = month === 12 ? 1 : month + 1;
    const anioSiguiente = month === 12 ? year + 1 : year;
    const mesSiguienteStr = String(mesSiguienteNum).padStart(2, '0');
    const desde = `${year}-${mesStr}-01`;
    const hasta = `${anioSiguiente}-${mesSiguienteStr}-01`;

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            *,
            categorias:id_categoria (id, nombre)
        `)
        .eq('user_id', usuario.id)
        .gte('fecha', desde)
        .lt('fecha', hasta)
        .order('fecha', { ascending: false });

    if (error) throw error;

    const gastos = data ?? [];

    const totalGastos = gastos.reduce((s, g) => s + parseFloat(g.monto || 0), 0);
    const gastosFijosLista = gastos.filter(g => g.es_fijo);
    const gastosFijos = gastosFijosLista.reduce((s, g) => s + parseFloat(g.monto || 0), 0);
    const gastosVariables = totalGastos - gastosFijos;

    const porCategoria = gastos.reduce((acc, g) => {
        const nombre = g.categorias?.nombre || 'Sin categoría';
        if (!acc[nombre]) acc[nombre] = { total: 0, cantidad: 0 };
        acc[nombre].total += parseFloat(g.monto || 0);
        acc[nombre].cantidad += 1;
        return acc;
    }, {});

    return { totalGastos, gastosFijos, gastosVariables, gastosFijosLista, porCategoria };
};

// ============================================================
// NOTIFICACIONES
// ============================================================

/**
 * Obtiene las notificaciones del usuario autenticado.
 * Ordena por fecha descendente y limita a las últimas 50.
 */
export const getNotificaciones = async () => {
    const usuario = await obtenerUsuarioActivo();
    const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .eq('user_id', usuario.id)
        .order('fecha_creacion', { ascending: false })
        .limit(50);

    if (error) throw error;
    return data || [];
};

/**
 * Crea una nueva notificación para el usuario autenticado.
 *
 * @param {Object} notificacion - { titulo, mensaje, tipo, origen, metadata }
 * @returns {Object} La notificación creada
 */
export const createNotificacion = async (notificacion) => {
    const usuario = await obtenerUsuarioActivo();
    const { data, error } = await supabase
        .from('notificaciones')
        .insert([{
            user_id:       usuario.id,
            titulo:        notificacion.titulo,
            mensaje:       notificacion.mensaje,
            tipo:          notificacion.tipo || 'info',
            origen:        notificacion.origen || 'app',
            metadata:      notificacion.metadata || null,
            leida:         false,
            email_enviado: false,
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Marca una notificación específica como leída.
 *
 * @param {number} id - ID de la notificación
 */
export const marcarLeida = async (id) => {
    const usuario = await obtenerUsuarioActivo();
    const { error } = await supabase
        .from('notificaciones')
        .update({ leida: true })
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) throw error;
};

/**
 * Marca todas las notificaciones del usuario como leídas.
 */
export const marcarTodasLeidas = async () => {
    const usuario = await obtenerUsuarioActivo();
    const { error } = await supabase
        .from('notificaciones')
        .update({ leida: true })
        .eq('user_id', usuario.id)
        .eq('leida', false);

    if (error) throw error;
};

/**
 * Actualiza el campo email_enviado y email_error de una notificación.
 * Se llama después de intentar el envío por email desde el backend.
 *
 * @param {number} id - ID de la notificación
 * @param {boolean} enviado
 * @param {string|null} errorMsg
 */
export const actualizarEstadoEmail = async (id, enviado, errorMsg = null) => {
    const usuario = await obtenerUsuarioActivo();
    const { error } = await supabase
        .from('notificaciones')
        .update({ email_enviado: enviado, email_error: errorMsg })
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) throw error;
};

// ============================================================
// CONFIGURACIÓN DE NOTIFICACIONES
// ============================================================

/**
 * Obtiene la configuración de notificaciones del usuario.
 * Si no existe, retorna null (el contexto usará defaults).
 */
export const getConfigNotificaciones = async () => {
    const usuario = await obtenerUsuarioActivo();
    const { data, error } = await supabase
        .from('configuracion_notificaciones')
        .select('*')
        .eq('user_id', usuario.id)
        .maybeSingle();

    if (error) throw error;
    return data;
};

/**
 * Guarda o actualiza la configuración de notificaciones del usuario (upsert).
 *
 * @param {Object} config - Campos a actualizar
 * @returns {Object} La configuración guardada
 */
export const saveConfigNotificaciones = async (config) => {
    const usuario = await obtenerUsuarioActivo();
    const { data, error } = await supabase
        .from('configuracion_notificaciones')
        .upsert(
            { ...config, user_id: usuario.id, fecha_actualizacion: new Date().toISOString() },
            { onConflict: 'user_id' }
        )
        .select()
        .single();

    if (error) throw error;
    return data;
};

// ============================================================
// GRUPOS DE GASTOS COMPARTIDOS
// ============================================================

// --- 2.1 Grupos (CRUD) ---

/**
 * Crea un nuevo grupo de gastos compartidos.
 * El trigger grupos_alta_admin_creador agrega al creador como admin automáticamente.
 *
 * @param {Object} params
 * @param {string} params.nombre - Nombre del grupo (requerido)
 * @param {string} [params.descripcion] - Descripción opcional
 * @param {string} [params.moneda='ARS'] - Moneda del grupo
 * @returns {Object} El grupo creado
 */
export const crearGrupo = async ({ nombre, descripcion, moneda = 'ARS' }) => {
    await obtenerUsuarioActivo();

    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre del grupo no puede estar vacío');
    }
    if (nombre.trim().length > 120) {
        throw new Error('El nombre del grupo no puede superar los 120 caracteres');
    }

    const { data: grupoId, error: errorRpc } = await supabase.rpc('crear_grupo_gasto_compartido', {
        p_nombre: nombre.trim(),
        p_descripcion: descripcion?.trim() || null,
        p_moneda: moneda,
    });

    if (errorRpc) throw new Error(errorRpc.message);

    const { data, error } = await supabase
        .from('grupos_gastos')
        .select('*')
        .eq('id', grupoId)
        .single();

    if (error) {
        return {
            id: grupoId,
            nombre: nombre.trim(),
            descripcion: descripcion?.trim() || null,
            moneda,
        };
    }

    return data;
};

/**
 * Actualiza los datos editables de un grupo (nombre y/o descripción).
 * Solo el admin del grupo puede hacer esta operación (RLS lo valida).
 *
 * @param {number} grupoId - ID del grupo
 * @param {Object} cambios - Campos a actualizar: { nombre?, descripcion? }
 * @returns {Object} El grupo actualizado
 */
export const actualizarGrupo = async (grupoId, cambios) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const actualizacion = {};
    if (cambios.nombre !== undefined) {
        if (!cambios.nombre.trim()) throw new Error('El nombre no puede estar vacío');
        actualizacion.nombre = cambios.nombre.trim();
    }
    if (cambios.descripcion !== undefined) {
        actualizacion.descripcion = cambios.descripcion?.trim() || null;
    }

    const { data, error } = await supabase
        .from('grupos_gastos')
        .update(actualizacion)
        .eq('id', grupoId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
};

/**
 * Archiva un grupo (soft delete: archivado=true).
 * El grupo ya no aparece en la lista activa pero se preservan los datos.
 * Solo el admin puede archivar (RLS lo valida).
 *
 * @param {number} grupoId - ID del grupo
 */
export const archivarGrupo = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { error } = await supabase
        .from('grupos_gastos')
        .update({ archivado: true })
        .eq('id', grupoId);

    if (error) throw new Error(error.message);
};

/**
 * Obtiene todos los grupos donde el usuario autenticado es miembro activo.
 * Hace JOIN con grupo_miembros para respetar la política de membresía.
 *
 * @returns {Array} Lista de grupos ordenados por fecha de creación descendente
 */
export const obtenerGruposDelUsuario = async () => {
    const usuario = await obtenerUsuarioActivo();

    // Primero obtenemos los IDs de grupos donde el usuario es miembro activo
    const { data: membresias, error: errMem } = await supabase
        .from('grupo_miembros')
        .select('grupo_id')
        .eq('user_id', usuario.id)
        .eq('estado', 'activo');

    if (errMem) throw new Error(errMem.message);
    if (!membresias || membresias.length === 0) return [];

    const grupoIds = membresias.map(m => m.grupo_id);

    const { data, error } = await supabase
        .from('grupos_gastos')
        .select('*')
        .in('id', grupoIds)
        .order('fecha_creacion', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
};

/**
 * Obtiene un grupo por su ID con la lista básica de miembros activos.
 * Solo accesible si el usuario es miembro activo (RLS lo valida).
 *
 * @param {number} grupoId - ID del grupo
 * @returns {Object} El grupo con sus miembros activos
 */
export const obtenerGrupoPorId = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { data, error } = await supabase
        .from('grupos_gastos')
        .select('*')
        .eq('id', grupoId)
        .single();

    if (error) throw new Error(error.message);
    return data;
};

// --- 2.2 Miembros ---

/**
 * Obtiene los miembros activos de un grupo.
 * No hace JOIN a auth.users porque el anon key no tiene acceso a esa tabla.
 * Retorna solo los campos de grupo_miembros.
 *
 * @param {number} grupoId - ID del grupo
 * @returns {Array} Lista de miembros activos con user_id, rol, alias, estado, fecha_alta
 */
export const obtenerMiembrosDelGrupo = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { data, error } = await supabase
        .from('grupo_miembros')
        .select('id, grupo_id, user_id, rol, estado, alias, fecha_alta')
        .eq('grupo_id', grupoId)
        .eq('estado', 'activo')
        .order('fecha_alta', { ascending: true });

    if (error) throw new Error(error.message);

    const miembros = data ?? [];

    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return miembros;

        const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
        const response = await fetch(`${backendUrl}/api/grupos/${grupoId}/miembros/perfiles`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) return miembros;

        const payload = await response.json();
        if (!payload?.ok || !Array.isArray(payload.perfiles)) return miembros;

        const perfilesMap = new Map(payload.perfiles.map((p) => [p.user_id, p]));

        return miembros.map((m) => {
            const perfil = perfilesMap.get(m.user_id);
            const nombre = perfil?.nombre?.trim();
            return {
                ...m,
                nombre: nombre || m.alias || 'Usuario sin nombre',
                alias: m.alias || nombre || 'Usuario sin nombre',
                email: perfil?.email || null,
            };
        });
    } catch {
        // Si falla el enriquecimiento, devolvemos los miembros base sin bloquear la pantalla.
        return miembros;
    }
};

/**
 * Cambia el rol de un miembro dentro del grupo.
 * Solo el admin puede hacer esta operación (RLS lo valida).
 *
 * @param {number} grupoId - ID del grupo
 * @param {string} userId - UUID del miembro a modificar
 * @param {string} rol - Nuevo rol: 'admin' | 'miembro'
 */
export const cambiarRolMiembro = async (grupoId, userId, rol) => {
    if (!grupoId || !userId) throw new Error('grupoId y userId son requeridos');
    if (!['admin', 'miembro'].includes(rol)) throw new Error('Rol inválido. Use "admin" o "miembro"');

    const { error } = await supabase
        .from('grupo_miembros')
        .update({ rol })
        .eq('grupo_id', grupoId)
        .eq('user_id', userId)
        .eq('estado', 'activo');

    if (error) throw new Error(error.message);
};

/**
 * Remueve un miembro del grupo (soft delete: estado='removido').
 * Solo el admin puede remover miembros (RLS lo valida).
 *
 * @param {number} grupoId - ID del grupo
 * @param {string} userId - UUID del miembro a remover
 */
export const removerMiembro = async (grupoId, userId) => {
    if (!grupoId || !userId) throw new Error('grupoId y userId son requeridos');

    const { error } = await supabase
        .from('grupo_miembros')
        .update({ estado: 'removido', fecha_baja: new Date().toISOString() })
        .eq('grupo_id', grupoId)
        .eq('user_id', userId)
        .eq('estado', 'activo');

    if (error) throw new Error(error.message);
};

/**
 * El usuario autenticado sale del grupo voluntariamente (auto-baja).
 * Usa el mismo mecanismo que removerMiembro pero con auth.uid() como target.
 *
 * @param {number} grupoId - ID del grupo del que se sale
 */
export const salirDelGrupo = async (grupoId) => {
    const usuario = await obtenerUsuarioActivo();
    await removerMiembro(grupoId, usuario.id);
};

// --- 2.3 Invitaciones (lectura/cancelación via Supabase; creación/aceptación via backend) ---

/**
 * Obtiene las invitaciones pendientes de un grupo.
 * Solo accesible para el admin del grupo (RLS lo valida).
 *
 * @param {number} grupoId - ID del grupo
 * @returns {Array} Lista de invitaciones con estado='pendiente'
 */
export const obtenerInvitacionesPendientes = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const ahora = new Date().toISOString();

    // Marcamos como expirada cualquier invitación vencida antes de listar.
    // Así la UI nunca muestra pendientes ya caducadas.
    const { error: errorExpirar } = await supabase
        .from('grupo_invitaciones')
        .update({ estado: 'expirada', fecha_resolucion: ahora })
        .eq('grupo_id', grupoId)
        .eq('estado', 'pendiente')
        .lt('fecha_expiracion', ahora);

    if (errorExpirar) throw new Error(errorExpirar.message);

    const { data, error } = await supabase
        .from('grupo_invitaciones')
        .select('id, grupo_id, email_invitado, estado, fecha_expiracion, fecha_creacion')
        .eq('grupo_id', grupoId)
        .eq('estado', 'pendiente')
        .order('fecha_creacion', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
};

/**
 * Obtiene las invitaciones dirigidas al usuario autenticado (match por email del JWT).
 * La RLS valida que el email del JWT coincida con email_invitado.
 *
 * @returns {Array} Invitaciones pendientes para el usuario actual
 */
export const obtenerInvitacionesParaMi = async () => {
    const usuario = await obtenerUsuarioActivo();
    const ahora = new Date().toISOString();

    // Igual que en las invitaciones del grupo: vencidas pasan a expirada antes de leer.
    const { error: errorExpirar } = await supabase
        .from('grupo_invitaciones')
        .update({ estado: 'expirada', fecha_resolucion: ahora })
        .eq('estado', 'pendiente')
        .eq('email_invitado', (usuario.email || '').toLowerCase())
        .lt('fecha_expiracion', ahora);

    if (errorExpirar) throw new Error(errorExpirar.message);

    // No filtramos por email aquí: la RLS lo hace comparando email_invitado con auth.jwt()->>'email'
    const { data, error } = await supabase
        .from('grupo_invitaciones')
        .select('id, grupo_id, email_invitado, estado, fecha_expiracion, fecha_creacion, invitado_por')
        .eq('estado', 'pendiente')
        .eq('email_invitado', (usuario.email || '').toLowerCase())
        .order('fecha_creacion', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
};

/**
 * Cancela una invitación pendiente.
 * Solo el admin del grupo puede cancelar invitaciones (RLS lo valida).
 *
 * @param {number} invitacionId - ID de la invitación a cancelar
 */
export const cancelarInvitacion = async (invitacionId) => {
    if (!invitacionId) throw new Error('ID de invitación inválido');

    const { error } = await supabase
        .from('grupo_invitaciones')
        .update({ estado: 'cancelada', fecha_resolucion: new Date().toISOString() })
        .eq('id', invitacionId)
        .eq('estado', 'pendiente');

    if (error) throw new Error(error.message);
};

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
    participantesUserIds,
}) => {
    if (!grupoId) throw new Error('ID de grupo requerido');
    if (!descripcion || !descripcion.trim()) throw new Error('La descripción es requerida');
    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) throw new Error('El monto debe ser mayor a cero');
    if (!pagadoPor) throw new Error('El pagador es requerido');
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        throw new Error('Debe haber al menos un participante');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
    const res = await fetch(`${backendUrl}/api/grupos/${grupoId}/gastos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ descripcion, monto: montoNum, pagadoPor, fecha, nota, idCategoria, participantesUserIds }),
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
    nota,
    idCategoria,
    participantesUserIds,
}) => {
    if (!grupoId) throw new Error('ID de grupo requerido');
    if (!descripcion || !descripcion.trim()) throw new Error('La descripción es requerida');
    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) throw new Error('El monto debe ser mayor a cero');
    const cantCuotas = Math.max(1, Math.min(18, parseInt(cuotas) || 1));
    if (!pagadoPor) throw new Error('El pagador es requerido');
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        throw new Error('Debe haber al menos un participante');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
    const res = await fetch(`${backendUrl}/api/grupos/${grupoId}/gastos-cuotas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
            descripcion,
            monto: montoNum,
            cuotas: cantCuotas,
            pagadoPor,
            fecha,
            nota,
            idCategoria,
            participantesUserIds,
        }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al crear el gasto en cuotas');
    return { gasto: json.gasto, gastos: json.gastos, participantes: json.participantes };
};

/**
 * Obtiene los gastos en cuotas activos de un grupo, agrupados por id_gasto_padre.
 * Solo incluye compras con tarjeta de crédito (metodo_pago = 'TARJETA DE CREDITO').
 * Útil para mostrar el panel de cuotas en el detalle del grupo.
 *
 * @param {number} grupoId - ID del grupo
 * @returns {Array} Grupos de cuotas: [{ id, descripcionBase, totalOriginal, cuotas, pagadas, pendientes, montoMensual, cuotasList }]
 */
export const obtenerCuotasGrupal = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { data, error } = await supabase
        .from('grupo_gastos')
        .select('id, descripcion, monto, fecha, cuotas, numero_cuota, id_gasto_padre, metodo_pago, estado, pagado_por')
        .eq('grupo_id', grupoId)
        .eq('estado', 'activo')
        .eq('metodo_pago', 'TARJETA DE CREDITO')
        .not('id_gasto_padre', 'is', null)
        .order('id_gasto_padre', { ascending: true })
        .order('numero_cuota', { ascending: true });

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return [];

    // Agrupar por id_gasto_padre
    const grupos = new Map();
    for (const cuota of data) {
        const padreId = cuota.id_gasto_padre;
        if (!grupos.has(padreId)) grupos.set(padreId, []);
        grupos.get(padreId).push(cuota);
    }

    const hoy = new Date().toISOString().split('T')[0];

    return Array.from(grupos.values()).map(cuotasList => {
        const primera = cuotasList[0];
        // Quitar el sufijo "(1/N)" para mostrar la descripción base
        const descripcionBase = primera.descripcion.replace(/\s*\(\d+\/\d+\)$/, '');
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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
    const res = await fetch(`${backendUrl}/api/grupos/${grupoId}/gastos/${gastoId}/anular`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
    const res = await fetch(`${backendUrl}/api/grupos/${grupoId}/gastos/${gastoId}/anular-cuotas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
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
 * @param {Object} campos - Campos a actualizar: descripcion, monto, pagadoPor, fecha, idCategoria, nota, participantesUserIds
 * @returns {Object} El gasto actualizado con los nuevos participantes
 */
export const actualizarGastoGrupal = async (gastoId, { grupoId, descripcion, monto, pagadoPor, fecha, idCategoria, nota, participantesUserIds }) => {
    if (!gastoId) throw new Error('ID de gasto inválido');
    if (!grupoId) throw new Error('ID de grupo inválido');
    if (!participantesUserIds?.length) throw new Error('Se requiere al menos un participante');
    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) throw new Error('El monto debe ser mayor a cero');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
    const res = await fetch(`${backendUrl}/api/grupos/${grupoId}/gastos/${gastoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ descripcion, monto: montoNum, pagadoPor, fecha, idCategoria, nota, participantesUserIds }),
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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const res = await fetch(`/api/grupos/${grupoId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
        },
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'No se pudo eliminar el grupo');
    return json;
};

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
    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) throw new Error('El monto debe ser mayor a cero');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
    const res = await fetch(`${backendUrl}/api/grupos/${grupoId}/liquidaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
    const res = await fetch(`${backendUrl}/api/grupos/${grupoId}/liquidaciones/${liquidacionId}/anular`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
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
