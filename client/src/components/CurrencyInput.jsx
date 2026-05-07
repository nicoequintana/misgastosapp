import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

/**
 * Componente de entrada de texto especializado para valores monetarios.
 * Maneja el formateo en tiempo real con separadores de miles (.) y decimales (,)
 * siguiendo la convención argentina (es-AR).
 * @param {number|string} value - El valor numérico interno.
 * @param {function} onChange - Callback que recibe el nuevo valor numérico.
 * @param {string} placeholder - Texto de ayuda cuando el input está vacío.
 * @param {string} className - Clases CSS adicionales.
 * @param {boolean} required - Si el campo es obligatorio.
 */
const CurrencyInput = ({ value, onChange, placeholder, className = 'input', required, disabled }) => {
    const [displayValue, setDisplayValue] = useState('');
    const inputRef = useRef(null);
    const cursorRef = useRef(null);

    // Ayudantes (Helpers)
    const formatInteger = (intStr) => {
        return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    const parseValue = (val) => {
        if (!val) return 0;
        return parseFloat(val.replace(/\./g, '').replace(',', '.'));
    };

    // Actualizar desde props (Cambio externo)
    useEffect(() => {
        // Solo actualizar si hay una diferencia considerable para evitar conflictos con el estado interno durante la escritura
        // Lógica: Si el valor de la prop corresponde a la visualización actual, no hacer nada.
        const currentParsed = parseValue(displayValue);
        const propVal = Number(value || 0);

        // Si la prop es 0 y estamos mostrando "", dejarlo así (a menos que se requiera mostrar 0)
        // El usuario generalmente quiere que empiece en 0.

        if (displayValue === '' && propVal === 0) return;

        if (currentParsed !== propVal) {
            const hasDecimals = propVal % 1 !== 0;
            const formatted = propVal.toLocaleString('es-AR', {
                minimumFractionDigits: hasDecimals ? 2 : 0,
                maximumFractionDigits: 2
            });
            setDisplayValue(formatted);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useLayoutEffect(() => {
        if (inputRef.current && cursorRef.current !== null) {
            inputRef.current.setSelectionRange(cursorRef.current, cursorRef.current);
            cursorRef.current = null;
        }
    }, [displayValue]);

    const handleChange = (e) => {
        const newValue = e.target.value;
        const oldCursor = e.target.selectionStart;

        // 1. Limpiar entrada: Permitir dígitos y UNA sola coma
        // Verificar si el usuario intenta escribir una segunda coma
        let clean = newValue.replace(/[^0-9,]/g, '');
        const parts = clean.split(',');
        if (parts.length > 2) {
            // Reconstruir manteniendo solo la primera coma
            clean = parts[0] + ',' + parts.slice(1).join('');
        }

        // 2. Lógica para determinar la posición del cursor relativa a los "dígitos"
        // Contar dígitos/comas antes del cursor en la NUEVA entrada cruda
        const leftSide = newValue.slice(0, oldCursor);
        const charsBeforeCursor = leftSide.replace(/[^0-9,]/g, '').length;

        // 3. Formatear la cadena de visualización
        const [intPart, decPart] = clean.split(',');

        // Eliminar ceros a la izquierda de la parte entera
        let formattedInt = intPart.replace(/^0+/, '');
        if (formattedInt === '' && intPart.includes('0')) formattedInt = '0'; // Si era solo 0
        if (formattedInt === '' && clean.startsWith(',')) formattedInt = '0'; // Si empieza con coma

        const intDisplay = formatInteger(formattedInt);

        let finalDisplay = intDisplay;
        if (clean.includes(',')) {
            finalDisplay += ',';
            if (decPart !== undefined) {
                // Limitar decimales a 2
                finalDisplay += decPart.slice(0, 2);
            }
        }

        // Caso especial: vacío
        if (!intPart && !decPart && !clean.includes(',')) {
            finalDisplay = '';
        }

        // 4. Calcular nueva posición del cursor
        // Poner el cursor a la derecha del 'charsBeforeCursor'-ésimo dígito/coma

        let targetIndex = 0;
        let count = 0;
        for (let i = 0; i < finalDisplay.length; i++) {
            targetIndex = i;
            if (count === charsBeforeCursor) break;
            if (/[0-9,]/.test(finalDisplay[i])) count++;
            if (count === charsBeforeCursor) {
                targetIndex = i + 1;
                break;
            }
        }

        cursorRef.current = targetIndex;
        setDisplayValue(finalDisplay);

        const floatVal = parseValue(finalDisplay);
        onChange(isNaN(floatVal) ? '' : floatVal);
    };

    return (
        <input
            ref={inputRef}
            type="text"
            className={className}
            placeholder={placeholder}
            value={displayValue}
            onChange={handleChange}
            required={required}
            disabled={disabled}
            autoComplete="off"
            inputMode="decimal"
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    // Delegamos el submit al formulario padre para no romper el comportamiento nativo.
                    e.target.closest('form')?.requestSubmit();
                }
            }}
        />
    );
};

export default CurrencyInput;
