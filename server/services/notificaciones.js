const { enviarEmailNotificacion, isSmtpConfigured } = require('./email');

/**
 * Servicio central de notificaciones.
 * Toda la lógica de creación y envío de notificaciones pasa por aquí.
 *
 * Principio: la notificación SIEMPRE se persiste en Supabase (lo hace el frontend).
 * El backend es responsable únicamente del envío de emails.
 * Si el email falla, se retorna el error pero no se interrumpe el flujo.
 */

/**
 * Envía el email de una notificación si el usuario tiene email habilitado.
 * Nunca lanza — siempre retorna { emailEnviado, emailError }.
 *
 * @param {string} emailUsuario - Email del destinatario
 * @param {Object} notificacion - Datos de la notificación
 * @param {Object} config - Configuración de notificaciones del usuario
 * @returns {Promise<{emailEnviado: boolean, emailError: string|null}>}
 */
const procesarEnvioEmail = async (emailUsuario, notificacion, config) => {
    // Si SMTP no configurado, salir silenciosamente — no persistir error en DB
    if (!isSmtpConfigured()) {
        return { emailEnviado: false, emailError: null };
    }

    // Notificaciones transaccionales (grupos) se envían siempre, sin importar config
    const esTransaccional = notificacion?.origen === 'grupos';

    // Si no hay config o email deshabilitado globalmente, no enviar (salvo transaccionales)
    if (!esTransaccional && (!config?.email_habilitado || !emailUsuario)) {
        return { emailEnviado: false, emailError: null };
    }

    if (!emailUsuario) {
        return { emailEnviado: false, emailError: null };
    }

    // Verificar si el origen/tipo específico tiene email habilitado
    const debeEnviar = determinarSiEnviarEmail(notificacion, config);
    if (!debeEnviar) {
        return { emailEnviado: false, emailError: null };
    }

    const resultado = await enviarEmailNotificacion(emailUsuario, notificacion);
    return {
        emailEnviado: resultado.ok,
        emailError:   resultado.ok ? null : resultado.error,
    };
};

/**
 * Mapa de estrategias de envío de email por origen.
 * Agregar un nuevo origen = agregar una entrada al mapa, sin tocar la función despachadora.
 */
const EMAIL_STRATEGIES = {
    n8n:       (config) => !!config.email_notificaciones_n8n,
    whatsapp:  (config) => !!config.email_notificaciones_n8n,
    ingresos:  (config) => !!config.email_habilitado,
    grupos:    ()       => true,
    proyeccion: (config) => !!(config.email_habilitado && config.email_resumen_diario),

    alertas_financieras: (config, metadata) => {
        if (!config.email_habilitado) return false;
        if (metadata?.saldo_disponible !== undefined) return !!config.email_saldo_bajo;
        if (metadata?.monto !== undefined && metadata?.umbral_configurado !== undefined) return !!config.email_gasto_alto;
        if (
            metadata?.fijos_mes_anterior !== undefined ||
            metadata?.variables_actual !== undefined ||
            metadata?.categoria !== undefined ||
            metadata?.porcentaje_fijos !== undefined
        ) return !!config.email_alertas_gastos_fijos;
        return false;
    },

    resumen: (config, metadata) => {
        if (!config.email_habilitado) return false;
        if (metadata?.fecha && !metadata?.desde) return !!config.email_resumen_diario;
        if (metadata?.desde !== undefined) return !!config.email_resumen_semanal;
        if (metadata?.mes !== undefined) return !!config.email_resumen_mensual;
        return false;
    },
};

/**
 * Determina si corresponde enviar email según la configuración del usuario
 * y el origen/tipo de la notificación.
 *
 * @param {Object} notificacion
 * @param {Object} config
 * @returns {boolean}
 */
const determinarSiEnviarEmail = (notificacion, config) => {
    const { origen, metadata } = notificacion;
    const estrategia = EMAIL_STRATEGIES[origen];
    // gastos, app, sistema, manual → no enviar email por defecto
    if (!estrategia) return false;
    return estrategia(config, metadata);
};

/**
 * Construye el objeto de notificación estándar para operaciones de gastos.
 * El frontend usará este contrato para persistir en Supabase.
 *
 * @param {'creado'|'editado'|'eliminado'|'eliminados_variables'} accion
 * @param {Object} [gasto] - Datos del gasto (opcional para 'eliminados_variables')
 * @returns {Object}
 */
const buildNotificacionGasto = (accion, gasto = null) => {
    const mapa = {
        creado: {
            titulo:  'Gasto registrado',
            mensaje: gasto
                ? `Se registró correctamente el gasto "${gasto.descripcion}" por $${Number(gasto.monto).toLocaleString('es-AR')}.`
                : 'Se registró correctamente un nuevo gasto.',
            tipo:    'success',
            origen:  'gastos',
        },
        editado: {
            titulo:  'Gasto actualizado',
            mensaje: gasto
                ? `Se actualizó el gasto "${gasto.descripcion}" por $${Number(gasto.monto).toLocaleString('es-AR')}.`
                : 'Se actualizó el gasto correctamente.',
            tipo:    'info',
            origen:  'gastos',
        },
        eliminado: {
            titulo:  'Gasto eliminado',
            mensaje: gasto
                ? `Se eliminó el gasto "${gasto.descripcion}".`
                : 'Se eliminó el gasto correctamente.',
            tipo:    'warning',
            origen:  'gastos',
        },
        eliminados_variables: {
            titulo:  'Gastos variables eliminados',
            mensaje: 'Se eliminaron todos los gastos variables del mes.',
            tipo:    'warning',
            origen:  'gastos',
        },
    };

    const base = mapa[accion] || {
        titulo:  'Operación realizada',
        mensaje: 'Se realizó una operación sobre gastos.',
        tipo:    'info',
        origen:  'gastos',
    };

    return {
        ...base,
        metadata: gasto
            ? {
                  descripcion:  gasto.descripcion || null,
                  monto:        gasto.monto ? `$${Number(gasto.monto).toLocaleString('es-AR')}` : null,
                  categoria:    gasto.categorias?.nombre || null,
                  metodo_pago:  gasto.metodos_pago?.nombre || null,
                  fecha:        gasto.fecha ? gasto.fecha.split('T')[0] : null,
                  tipo_gasto:   gasto.es_fijo ? 'Fijo' : 'Variable',
              }
            : null,
    };
};

/**
 * Construye el objeto de notificación para gastos cargados desde n8n.
 *
 * @param {'creado'|'duplicado'|'error'} resultado
 * @param {Object} datos - Datos del gasto o del error
 * @returns {Object}
 */
const buildNotificacionN8n = (resultado, datos = {}) => {
    const mapa = {
        creado: {
            titulo:  'Gasto registrado desde WhatsApp',
            mensaje: `Se registró automáticamente el gasto "${datos.descripcion || ''}" por $${Number(datos.monto || 0).toLocaleString('es-AR')}.`,
            tipo:    'success',
            origen:  'n8n',
        },
        duplicado: {
            titulo:  'Gasto duplicado detectado',
            mensaje: `El gasto "${datos.descripcion || ''}" ya fue registrado anteriormente. No se creó un duplicado.`,
            tipo:    'warning',
            origen:  'n8n',
        },
        error: {
            titulo:  'Error en carga automática',
            mensaje: `No se pudo registrar el gasto automáticamente. Motivo: ${datos.motivo || 'error desconocido'}.`,
            tipo:    'error',
            origen:  'n8n',
        },
    };

    const base = mapa[resultado] || mapa.error;

    return {
        ...base,
        metadata: {
            descripcion: datos.descripcion || null,
            monto:       datos.monto ? `$${Number(datos.monto).toLocaleString('es-AR')}` : null,
            fecha:       datos.fecha || null,
            motivo:      datos.motivo || null,
        },
    };
};

/**
 * Construye el objeto de notificación para operaciones dentro de un grupo compartido.
 * Estas notificaciones son transaccionales (origen = 'grupos') → se envían siempre por email.
 *
 * @param {'gasto_creado'|'gasto_editado'|'gasto_anulado'|'liquidacion_registrada'|'liquidacion_anulada'|'miembro_unido'} evento
 * @param {Object} datos - Datos específicos del evento
 * @returns {Object}
 */
const buildNotificacionGrupo = (evento, datos = {}) => {
    const grupoNombre = datos.grupoNombre || 'el grupo';
    const actor = datos.actorNombre || 'Un miembro';

    const mapa = {
        gasto_creado: {
            titulo:  'Nuevo gasto en el grupo',
            mensaje: `${actor} registró el gasto "${datos.descripcion || ''}" por $${Number(datos.monto || 0).toLocaleString('es-AR')} en "${grupoNombre}".`,
            tipo:    'info',
        },
        gasto_editado: {
            titulo:  'Gasto modificado en el grupo',
            mensaje: `${actor} editó el gasto "${datos.descripcion || ''}" en "${grupoNombre}". Nuevo monto: $${Number(datos.monto || 0).toLocaleString('es-AR')}.`,
            tipo:    'info',
        },
        gasto_anulado: {
            titulo:  'Gasto anulado en el grupo',
            mensaje: `${actor} anuló el gasto "${datos.descripcion || ''}" de $${Number(datos.monto || 0).toLocaleString('es-AR')} en "${grupoNombre}".`,
            tipo:    'warning',
        },
        liquidacion_registrada: {
            titulo:  'Liquidación registrada',
            mensaje: `${actor} registró un pago de $${Number(datos.monto || 0).toLocaleString('es-AR')} en "${grupoNombre}".`,
            tipo:    'success',
        },
        liquidacion_anulada: {
            titulo:  'Liquidación anulada',
            mensaje: `${actor} anuló un pago de $${Number(datos.monto || 0).toLocaleString('es-AR')} en "${grupoNombre}".`,
            tipo:    'warning',
        },
        miembro_unido: {
            titulo:  'Nuevo miembro en el grupo',
            mensaje: `${actor} se unió al grupo "${grupoNombre}".`,
            tipo:    'info',
        },
    };

    const base = mapa[evento] || {
        titulo:  'Actividad en el grupo',
        mensaje: `Hubo actividad en el grupo "${grupoNombre}".`,
        tipo:    'info',
    };

    return {
        ...base,
        origen:   'grupos',
        metadata: { ...datos },
    };
};

module.exports = {
    procesarEnvioEmail,
    buildNotificacionGasto,
    buildNotificacionN8n,
    buildNotificacionGrupo,
    determinarSiEnviarEmail,
};
