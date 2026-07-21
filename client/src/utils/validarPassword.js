// Reglas de seguridad de contraseña de TusGastosApp: mínimo 10 caracteres,
// al menos una mayúscula, un número y un carácter especial.
// Debe coincidir con la validación server-side en server/routes/authRecovery.js.
export const validarPassword = (password) => {
    const errores = [];
    if (!password || password.length < 10) errores.push('Debe tener al menos 10 caracteres.');
    if (!/[A-Z]/.test(password || '')) errores.push('Debe incluir al menos una mayúscula.');
    if (!/[0-9]/.test(password || '')) errores.push('Debe incluir al menos un número.');
    if (!/[^A-Za-z0-9]/.test(password || '')) errores.push('Debe incluir al menos un carácter especial.');
    return { valida: errores.length === 0, errores };
};
