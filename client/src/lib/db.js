import { supabase } from './supabase';

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
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error('No hay sesión de usuario activa. Por favor, iniciá sesión nuevamente.');
    }

    return user;
};

// ==================== GASTOS ====================

/**
 * Obtiene todos los gastos del usuario autenticado.
 * Incluye datos relacionados de categoría y método de pago.
 * 
 * @returns {Array} Lista de gastos ordenados por fecha descendente
 */
export const getExpenses = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            *,
            categorias:id_categoria (id, nombre),
            metodos_pago:id_metodo_pago (id, nombre)
        `)
        .eq('user_id', usuario.id)
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

    // Validar descripción: debe ser string
    if (typeof gasto.descripcion !== 'string' || !gasto.descripcion.trim()) {
        throw new Error('La descripción debe ser un texto válido');
    }

    // Validar monto: debe ser número positivo
    const montoNumero = Number(gasto.monto);
    if (isNaN(montoNumero) || montoNumero <= 0) {
        throw new Error('El monto debe ser mayor a cero');
    }

    const { data, error } = await supabase
        .from('gastos')
        .insert([{
            user_id: usuario.id,
            descripcion: gasto.descripcion.trim().toUpperCase(),
            monto: montoNumero,
            id_categoria: gasto.id_categoria || null,
            id_metodo_pago: gasto.id_metodo_pago || null,
            fecha: gasto.fecha || new Date().toISOString().split('T')[0],
            es_fijo: Boolean(gasto.es_fijo)
        }])
        .select()
        .single();

    if (error) {
        console.error('❌ Error en createExpense:', error);
        throw error;
    }
    return data;
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
    const usuario = await obtenerUsuarioActivo();

    // Validar monto si se proporciona
    if (gasto.monto !== undefined) {
        const montoNumero = Number(gasto.monto);
        if (isNaN(montoNumero) || montoNumero <= 0) {
            throw new Error('El monto debe ser mayor a cero');
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
 * Obtiene todas las categorías activas del usuario.
 * 
 * @returns {Array} Lista de categorías ordenadas alfabéticamente
 */
export const getCategories = async () => {
    const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .order('nombre');

    if (error) throw error;
    return data ?? [];
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
 * Obtiene el ingreso activo del usuario.
 * Si no existe ninguno, retorna monto 0 sin crear filas vacías.
 */
export const getIncome = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('ingresos')
        .select('*')
        .eq('user_id', usuario.id)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('❌ Error en getIncome:', error);
        throw error;
    }

    return data ?? { monto: 0 };
};

/**
 * Guarda el ingreso del usuario.
 * Intenta actualizar primero; si no afecta filas, crea uno nuevo.
 * Garantiza que cada usuario tenga exactamente un registro de ingreso.
 * 
 * @param {number} monto - Monto del ingreso
 * @returns {Object} El registro de ingreso (creado o actualizado)
 * @throws {Error} Si el monto no es válido o es ≤ 0
 */
export const saveIncome = async (monto) => {
    const usuario = await obtenerUsuarioActivo();
    
    // Validar que el monto sea un número positivo
    const montoLimpio = Number(monto);
    if (isNaN(montoLimpio) || montoLimpio <= 0) {
        throw new Error('El ingreso debe ser mayor a cero');
    }

    // Upsert atómico: crea la fila si no existe, actualiza si ya existe.
    // Evita la race condition del patrón update-then-insert.
    const { data, error } = await supabase
        .from('ingresos')
        .upsert(
            { user_id: usuario.id, monto: montoLimpio, fecha_actualizacion: new Date().toISOString() },
            { onConflict: 'user_id' }
        )
        .select()
        .single();

    if (error) {
        console.error('❌ Error en saveIncome:', error);
        throw error;
    }

    return data;
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
    // Obtener gastos e ingresos en paralelo para reducir latencia
    const [gastos, ingreso] = await Promise.all([
        getExpenses(),
        getIncome()
    ]);

    // Calcular totales
    const totalGastos = gastos.reduce((suma, gasto) => suma + parseFloat(gasto.monto || 0), 0);
    const gastosFijos = gastos
        .filter(gasto => gasto.es_fijo)
        .reduce((suma, gasto) => suma + parseFloat(gasto.monto || 0), 0);
    const gastosVariables = totalGastos - gastosFijos;
    const saldoDisponible = (ingreso?.monto || 0) - totalGastos;

    // Agrupar gastos por categoría para gráficos/informes
    const porCategoria = gastos.reduce((acumulador, gasto) => {
        const nombreCategoria = gasto.categorias?.nombre || 'Sin categoría';
        if (!acumulador[nombreCategoria]) {
            acumulador[nombreCategoria] = { total: 0, cantidad: 0 };
        }
        acumulador[nombreCategoria].total += parseFloat(gasto.monto || 0);
        acumulador[nombreCategoria].cantidad += 1;
        return acumulador;
    }, {});

    return {
        totalGastos,
        gastosFijos,
        gastosVariables,
        saldoDisponible,
        ingresoMensual: ingreso?.monto || 0,
        gastos,
        porCategoria
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
        getIncome(),
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
