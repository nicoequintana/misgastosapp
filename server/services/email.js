const nodemailer = require('nodemailer');

/**
 * Verifica si el SMTP está configurado con las variables de entorno mínimas.
 */
const isSmtpConfigured = () =>
    !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

/**
 * Crea el transporter de nodemailer a partir de las variables de entorno.
 * Retorna null si no está configurado.
 */
const crearTransporter = () => {
    if (!isSmtpConfigured()) return null;

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
};

/**
 * Construye el HTML del email con la información de la notificación.
 */
const buildEmailHtml = (notificacion) => {
    const { titulo, mensaje, tipo, origen, fecha_creacion, metadata } = notificacion;

    const coloresTipo = {
        success: '#10b981',
        warning: '#fbbf24',
        error:   '#fa6238',
        info:    '#137fec',
    };

    const iconosTipo = {
        success: '✅',
        warning: '⚠️',
        error:   '❌',
        info:    'ℹ️',
    };

    const color = coloresTipo[tipo] || coloresTipo.info;
    const icono = iconosTipo[tipo] || iconosTipo.info;

    const fechaLegible = fecha_creacion
        ? new Date(fecha_creacion).toLocaleString('es-AR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
          })
        : new Date().toLocaleString('es-AR');

    // Genera filas extras si hay metadata relevante
    let metadataHtml = '';
    if (metadata && typeof metadata === 'object') {
        const filas = Object.entries(metadata)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([k, v]) => `
                <tr>
                    <td style="padding:6px 12px;font-size:13px;color:#64748b;font-weight:600;text-transform:capitalize;">
                        ${k.replace(/_/g, ' ')}
                    </td>
                    <td style="padding:6px 12px;font-size:13px;color:#0f172a;">${v}</td>
                </tr>`)
            .join('');

        if (filas) {
            metadataHtml = `
            <div style="margin-top:20px;">
                <p style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
                    Información adicional
                </p>
                <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;">
                    ${filas}
                </table>
            </div>`;
        }
    }

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
            <tr><td align="center">
                <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,${color},${color}cc);padding:24px 32px;">
                            <p style="margin:0;font-size:13px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">
                                MisGastosApp
                            </p>
                            <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">
                                ${icono} ${titulo}
                            </h1>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:28px 32px;">
                            <p style="margin:0 0 20px;font-size:16px;color:#0f172a;line-height:1.6;">
                                ${mensaje}
                            </p>

                            <!-- Metadatos básicos -->
                            <table style="width:100%;border-collapse:collapse;">
                                <tr>
                                    <td style="padding:6px 0;font-size:12px;color:#64748b;font-weight:600;width:40%;">Tipo</td>
                                    <td style="padding:6px 0;font-size:12px;color:#0f172a;text-transform:capitalize;">${tipo}</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0;font-size:12px;color:#64748b;font-weight:600;">Origen</td>
                                    <td style="padding:6px 0;font-size:12px;color:#0f172a;text-transform:capitalize;">${origen}</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0;font-size:12px;color:#64748b;font-weight:600;">Fecha</td>
                                    <td style="padding:6px 0;font-size:12px;color:#0f172a;">${fechaLegible}</td>
                                </tr>
                            </table>

                            ${metadataHtml}
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
                                Este email fue enviado automáticamente por MisGastosApp.<br>
                                Para gestionar tus notificaciones, accedé a Configuración en la app.
                            </p>
                        </td>
                    </tr>
                </table>
            </td></tr>
        </table>
    </body>
    </html>`;
};

/**
 * Envía un email con la información de una notificación.
 * Retorna { ok: true } si el envío fue exitoso, o { ok: false, error } si falló.
 * Nunca lanza — el llamador no debe romper si el email falla.
 *
 * @param {string} destinatario - Email del usuario
 * @param {Object} notificacion - Datos de la notificación
 */
const enviarEmailNotificacion = async (destinatario, notificacion) => {
    if (!isSmtpConfigured()) {
        console.warn('⚠️ SMTP no configurado. Saltando envío de email.');
        return { ok: false, error: 'SMTP no configurado' };
    }

    if (!destinatario) {
        return { ok: false, error: 'Destinatario no especificado' };
    }

    try {
        const transporter = crearTransporter();

        const fromName  = process.env.SMTP_FROM_NAME  || 'MisGastosApp';
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

        await transporter.sendMail({
            from:    `"${fromName}" <${fromEmail}>`,
            to:      destinatario,
            subject: `[MisGastosApp] ${notificacion.titulo}`,
            html:    buildEmailHtml(notificacion),
            text:    `${notificacion.titulo}\n\n${notificacion.mensaje}\n\nTipo: ${notificacion.tipo}\nOrigen: ${notificacion.origen}`,
        });

        return { ok: true };
    } catch (err) {
        console.error('❌ Error al enviar email de notificación:', err.message);
        return { ok: false, error: err.message };
    }
};

module.exports = { enviarEmailNotificacion, isSmtpConfigured };
