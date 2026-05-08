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
 * Escapa caracteres HTML para evitar inyección en el cuerpo del email.
 */
const escapeHtml = (val) => {
    if (val === null || val === undefined) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

/**
 * Construye el HTML del email con la información de la notificación.
 */
const buildEmailHtml = (notificacion) => {
    const { titulo, mensaje, origen, fecha_creacion, metadata } = notificacion;

    const TIPOS_VALIDOS = ['success', 'warning', 'error', 'info'];
    const tipo = TIPOS_VALIDOS.includes(notificacion.tipo) ? notificacion.tipo : 'info';

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

    const color = coloresTipo[tipo];
    const icono = iconosTipo[tipo];

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
                        ${escapeHtml(k.replace(/_/g, ' '))}
                    </td>
                    <td style="padding:6px 12px;font-size:13px;color:#0f172a;">${escapeHtml(v)}</td>
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
                                TusGastosApp
                            </p>
                            <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">
                                ${icono} ${escapeHtml(titulo)}
                            </h1>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:28px 32px;">
                            <p style="margin:0 0 20px;font-size:16px;color:#0f172a;line-height:1.6;">
                                ${escapeHtml(mensaje)}
                            </p>

                            <!-- Metadatos básicos -->
                            <table style="width:100%;border-collapse:collapse;">
                                <tr>
                                    <td style="padding:6px 0;font-size:12px;color:#64748b;font-weight:600;width:40%;">Tipo</td>
                                    <td style="padding:6px 0;font-size:12px;color:#0f172a;text-transform:capitalize;">${escapeHtml(tipo)}</td>
                                </tr>
                                <tr>
                                    <td style="padding:6px 0;font-size:12px;color:#64748b;font-weight:600;">Origen</td>
                                    <td style="padding:6px 0;font-size:12px;color:#0f172a;text-transform:capitalize;">${escapeHtml(origen)}</td>
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
                                Este email fue enviado automáticamente por TusGastosApp.<br>
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

        // Sanitizar fromName — previene email header injection via newlines
        const fromName  = (process.env.SMTP_FROM_NAME || 'TusGastosApp').replace(/[\r\n\t]/g, ' ').slice(0, 100);
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

        await transporter.sendMail({
            from:    `"${fromName}" <${fromEmail}>`,
            to:      destinatario,
            subject: `[TusGastosApp] ${notificacion.titulo}`,
            html:    buildEmailHtml(notificacion),
            text:    `${notificacion.titulo}\n\n${notificacion.mensaje}\n\nTipo: ${notificacion.tipo}\nOrigen: ${notificacion.origen}`,
        });

        return { ok: true };
    } catch (err) {
        console.error('❌ Error al enviar email de notificación:', err.message);
        return { ok: false, error: err.message };
    }
};

/**
 * Construye el HTML del email de invitación a un grupo de gastos compartidos.
 * Reutiliza la misma estructura glassmorphism del resto de los emails.
 */
const buildInvitacionGrupoHtml = ({ grupoNombre, invitadorNombre, link, fechaExpiracion }) => {
    const fechaLegible = fechaExpiracion
        ? new Date(fechaExpiracion).toLocaleString('es-AR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
          })
        : '';

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
                        <td style="background:linear-gradient(135deg,#6366f1,#818cf8);padding:24px 32px;">
                            <p style="margin:0;font-size:13px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">
                                TusGastosApp
                            </p>
                            <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">
                                👥 Invitación a grupo
                            </h1>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:28px 32px;">
                            <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.6;">
                                <strong>${escapeHtml(invitadorNombre)}</strong> te invitó a unirte al grupo
                                <strong>"${escapeHtml(grupoNombre)}"</strong> en TusGastosApp para compartir gastos.
                            </p>

                            <!-- CTA principal -->
                            <div style="text-align:center;margin:28px 0;">
                                <a href="${escapeHtml(link)}"
                                   style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 4px 14px rgba(99,102,241,0.4);">
                                    Aceptar invitación
                                </a>
                            </div>

                            ${fechaLegible ? `
                            <p style="margin:0;font-size:13px;color:#64748b;text-align:center;">
                                Esta invitación vence el <strong>${escapeHtml(fechaLegible)}</strong>.
                            </p>` : ''}

                            <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;text-align:center;">
                                Si no esperabas esta invitación, podés ignorar este mensaje.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
                                Este email fue enviado automáticamente por TusGastosApp.<br>
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
 * Construye el HTML del email para invitar a registrarse en la app.
 */
const buildInvitacionRegistroHtml = ({ grupoNombre, invitadorNombre, linkRegistro }) => {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
            <tr><td align="center">
                <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                    <tr>
                        <td style="background:linear-gradient(135deg,#0ea5e9,#22d3ee);padding:24px 32px;">
                            <p style="margin:0;font-size:13px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">
                                TusGastosApp
                            </p>
                            <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">
                                ✨ Te invitaron a registrarte
                            </h1>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:28px 32px;">
                            <p style="margin:0 0 16px;font-size:16px;color:#0f172a;line-height:1.6;">
                                <strong>${escapeHtml(invitadorNombre)}</strong> quiere sumarte al grupo
                                <strong>"${escapeHtml(grupoNombre)}"</strong> en TusGastosApp.
                            </p>

                            <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
                                Para aceptar la invitación, primero registrate o iniciá sesión con Google.
                            </p>

                            <div style="text-align:center;margin:28px 0;">
                                <a href="${escapeHtml(linkRegistro)}"
                                   style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0ea5e9,#22d3ee);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 4px 14px rgba(14,165,233,0.35);">
                                    Registrarme en TusGastosApp
                                </a>
                            </div>

                            <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;text-align:center;">
                                Si no esperabas este email, podés ignorarlo.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
                                Este email fue enviado automáticamente por TusGastosApp.
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
 * Envía un email de invitación a un grupo de gastos compartidos.
 * Nunca lanza — el llamador decide qué hacer si el envío falla.
 *
 * @param {string} destinatario - Email del invitado
 * @param {Object} datos
 * @param {string} datos.grupoNombre - Nombre del grupo al que se invita
 * @param {string} datos.invitadorNombre - Nombre o email del admin que invita
 * @param {string} datos.link - URL completa para aceptar la invitación
 * @param {string} [datos.fechaExpiracion] - ISO string de expiración (opcional)
 */
const enviarEmailInvitacionGrupo = async (destinatario, { grupoNombre, invitadorNombre, link, fechaExpiracion }) => {
    if (!isSmtpConfigured()) {
        console.warn('⚠️ SMTP no configurado. Saltando envío de email de invitación.');
        return { ok: false, error: 'SMTP no configurado' };
    }

    if (!destinatario) {
        return { ok: false, error: 'Destinatario no especificado' };
    }

    try {
        const transporter = crearTransporter();

        // Sanitizar fromName — previene email header injection via newlines
        const fromName  = (process.env.SMTP_FROM_NAME || 'TusGastosApp').replace(/[\r\n\t]/g, ' ').slice(0, 100);
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
        const subject   = `[TusGastosApp] ${invitadorNombre} te invitó al grupo "${grupoNombre}"`;

        await transporter.sendMail({
            from:    `"${fromName}" <${fromEmail}>`,
            to:      destinatario,
            subject,
            html:    buildInvitacionGrupoHtml({ grupoNombre, invitadorNombre, link, fechaExpiracion }),
            text:    `${invitadorNombre} te invitó al grupo "${grupoNombre}" en TusGastosApp.\n\nAceptar invitación: ${link}\n\nEsta invitación vence el ${fechaExpiracion ? new Date(fechaExpiracion).toLocaleDateString('es-AR') : 'pronto'}.`,
        });

        return { ok: true };
    } catch (err) {
        console.error('❌ Error al enviar email de invitación de grupo:', err.message);
        return { ok: false, error: err.message };
    }
};

/**
 * Envía un email para invitar a una persona no registrada a crear su cuenta.
 */
const enviarEmailInvitacionRegistro = async (destinatario, { grupoNombre, invitadorNombre, linkRegistro }) => {
    if (!isSmtpConfigured()) {
        console.warn('⚠️ SMTP no configurado. Saltando envío de email de registro.');
        return { ok: false, error: 'SMTP no configurado' };
    }

    if (!destinatario) {
        return { ok: false, error: 'Destinatario no especificado' };
    }

    try {
        const transporter = crearTransporter();

        const fromName  = (process.env.SMTP_FROM_NAME || 'TusGastosApp').replace(/[\r\n\t]/g, ' ').slice(0, 100);
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
        const subject   = `[TusGastosApp] ${invitadorNombre} te invitó a registrarte`;

        await transporter.sendMail({
            from:    `"${fromName}" <${fromEmail}>`,
            to:      destinatario,
            subject,
            html:    buildInvitacionRegistroHtml({ grupoNombre, invitadorNombre, linkRegistro }),
            text:    `${invitadorNombre} te invitó al grupo "${grupoNombre}" en TusGastosApp.\n\nPrimero necesitás registrarte: ${linkRegistro}`,
        });

        return { ok: true };
    } catch (err) {
        console.error('❌ Error al enviar email de invitación a registro:', err.message);
        return { ok: false, error: err.message };
    }
};

module.exports = {
    enviarEmailNotificacion,
    enviarEmailInvitacionGrupo,
    enviarEmailInvitacionRegistro,
    isSmtpConfigured,
};
