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

    // Si no hay config o email deshabilitado globalmente, no enviar
    if (!config?.email_habilitado || !emailUsuario) {
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
 * Determina si corresponde enviar email según la configuración del usuario
 * y el origen/tipo de la notificación.
 *
 * @param {Object} notificacion
 * @param {Object} config
 * @returns {boolean}
 */
const determinarSiEnviarEmail = (notificacion, config) => {
    const { origen, metadata } = notificacion;

    switch (origen) {
        case 'n8n':
        case 'whatsapp':
            return !!config.email_notificaciones_n8n;

        case 'ingresos':
            return !!config.email_habilitado;

        case 'alertas_financieras': {
            if (!config.email_habilitado) return false;
            // Detectar sub-tipo por estructura del metadata
            if (metadata?.saldo_disponible !== undefined) return !!config.email_saldo_bajo;
            if (metadata?.monto !== undefined && metadata?.umbral_configurado !== undefined) return !!config.email_gasto_alto;
            // Alertas de Fase 4: gastos fijos/variables/categoría
            if (
                metadata?.fijos_mes_anterior !== undefined ||
                metadata?.variables_actual !== undefined ||
                metadata?.categoria !== undefined ||
                metadata?.porcentaje_fijos !== undefined
            ) return !!config.email_alertas_gastos_fijos;
            // Sub-tipo no identificable — no enviar para evitar falsos positivos
            return false;
        }

        case 'proyeccion':
            // Proyecciones y resúmenes usan el toggle de resúmenes
            return !!(config.email_habilitado && config.email_resumen_diario);

        case 'resumen': {
            if (!config.email_habilitado) return false;
            if (metadata?.fecha && !metadata?.desde) return !!config.email_resumen_diario;
            if (metadata?.desde !== undefined) return !!config.email_resumen_semanal;
            if (metadata?.mes !== undefined) return !!config.email_resumen_mensual;
            return false;
        }

        // gastos, app, sistema, manual → no enviar email por defecto
        default:
            return false;
    }
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

module.exports = {
    procesarEnvioEmail,
    buildNotificacionGasto,
    buildNotificacionN8n,
    determinarSiEnviarEmail,
};
