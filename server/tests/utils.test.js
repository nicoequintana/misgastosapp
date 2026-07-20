const { normalizeAmount, generateFingerprint, compararApiKey } = require('../utils');

// ── normalizeAmount ──────────────────────────────────────────────────────────

describe('normalizeAmount', () => {
    describe('entrada numérica', () => {
        it('retorna el mismo número si es finito', () => {
            expect(normalizeAmount(100)).toBe(100);
            expect(normalizeAmount(0)).toBe(0);
            expect(normalizeAmount(1500.50)).toBe(1500.50);
        });

        it('retorna NaN si el número no es finito', () => {
            expect(normalizeAmount(Infinity)).toBeNaN();
            expect(normalizeAmount(-Infinity)).toBeNaN();
            expect(normalizeAmount(NaN)).toBeNaN();
        });
    });

    describe('entrada string — formato argentino (punto=miles, coma=decimal)', () => {
        it('parsea entero simple', () => {
            expect(normalizeAmount('100')).toBe(100);
        });

        it('parsea decimal con coma', () => {
            expect(normalizeAmount('1500,50')).toBe(1500.50);
        });

        it('parsea miles con punto y decimal con coma', () => {
            expect(normalizeAmount('1.500,50')).toBe(1500.50);
        });

        it('parsea millones con puntos como separador', () => {
            expect(normalizeAmount('1.000.000')).toBe(1000000);
        });

        it('parsea con espacios al inicio/final', () => {
            expect(normalizeAmount('  500  ')).toBe(500);
        });

        it('retorna NaN para string vacío', () => {
            expect(normalizeAmount('')).toBeNaN();
        });

        it('retorna NaN para string no numérico', () => {
            expect(normalizeAmount('abc')).toBeNaN();
        });

        it('string con letras después de número: parseFloat toma la parte numérica inicial', () => {
            // parseFloat('12ab') → 12: comportamiento nativo de JS, no un error del parser
            expect(normalizeAmount('12ab')).toBe(12);
        });
    });

    describe('entrada de tipo inválido', () => {
        it('retorna NaN para null', () => {
            expect(normalizeAmount(null)).toBeNaN();
        });

        it('retorna NaN para undefined', () => {
            expect(normalizeAmount(undefined)).toBeNaN();
        });

        it('retorna NaN para array', () => {
            expect(normalizeAmount([])).toBeNaN();
        });

        it('retorna NaN para objeto', () => {
            expect(normalizeAmount({})).toBeNaN();
        });
    });
});

// ── generateFingerprint ──────────────────────────────────────────────────────

describe('generateFingerprint', () => {
    const base = {
        descripcion: 'SUPERMERCADO',
        monto: 1500.50,
        categoria: 'alimentacion',
        medioPago: 'efectivo',
        fecha: '2026-05-10',
    };

    it('retorna un string hexadecimal de 64 caracteres (SHA-256)', () => {
        const fp = generateFingerprint(base);
        expect(typeof fp).toBe('string');
        expect(fp).toHaveLength(64);
        expect(fp).toMatch(/^[0-9a-f]+$/);
    });

    it('el mismo input siempre produce el mismo hash (determinismo)', () => {
        expect(generateFingerprint(base)).toBe(generateFingerprint(base));
    });

    it('descripciones en distinto case producen el mismo hash (normalización a lowercase)', () => {
        const fp1 = generateFingerprint({ ...base, descripcion: 'Supermercado' });
        const fp2 = generateFingerprint({ ...base, descripcion: 'SUPERMERCADO' });
        const fp3 = generateFingerprint({ ...base, descripcion: 'supermercado' });
        expect(fp1).toBe(fp2);
        expect(fp2).toBe(fp3);
    });

    it('descripciones con espacios al inicio/final producen el mismo hash (trim)', () => {
        const fp1 = generateFingerprint({ ...base, descripcion: '  SUPERMERCADO  ' });
        const fp2 = generateFingerprint({ ...base, descripcion: 'SUPERMERCADO' });
        expect(fp1).toBe(fp2);
    });

    it('distintos montos producen hashes distintos', () => {
        const fp1 = generateFingerprint({ ...base, monto: 1000 });
        const fp2 = generateFingerprint({ ...base, monto: 1001 });
        expect(fp1).not.toBe(fp2);
    });

    it('distintas fechas producen hashes distintos', () => {
        const fp1 = generateFingerprint({ ...base, fecha: '2026-05-10' });
        const fp2 = generateFingerprint({ ...base, fecha: '2026-05-11' });
        expect(fp1).not.toBe(fp2);
    });

    it('distintas categorías producen hashes distintos', () => {
        const fp1 = generateFingerprint({ ...base, categoria: 'alimentacion' });
        const fp2 = generateFingerprint({ ...base, categoria: 'transporte' });
        expect(fp1).not.toBe(fp2);
    });

    it('distintos medios de pago producen hashes distintos', () => {
        const fp1 = generateFingerprint({ ...base, medioPago: 'efectivo' });
        const fp2 = generateFingerprint({ ...base, medioPago: 'debito' });
        expect(fp1).not.toBe(fp2);
    });

    it('categoría y medioPago también se normalizan a lowercase', () => {
        const fp1 = generateFingerprint({ ...base, categoria: 'Alimentacion', medioPago: 'Efectivo' });
        const fp2 = generateFingerprint({ ...base, categoria: 'alimentacion', medioPago: 'efectivo' });
        expect(fp1).toBe(fp2);
    });

    it('el monto se normaliza con 2 decimales (1500 y 1500.00 son iguales)', () => {
        const fp1 = generateFingerprint({ ...base, monto: 1500 });
        const fp2 = generateFingerprint({ ...base, monto: 1500.00 });
        expect(fp1).toBe(fp2);
    });
});

// ── compararApiKey (fix S-02: timing attack en validateApiKey) ────────────────

describe('compararApiKey', () => {
    it('retorna true cuando las keys son idénticas', () => {
        expect(compararApiKey('clave-secreta-123', 'clave-secreta-123')).toBe(true);
    });

    it('retorna false cuando las keys difieren', () => {
        expect(compararApiKey('clave-incorrecta', 'clave-secreta-123')).toBe(false);
    });

    it('retorna false cuando difieren solo en longitud (sin lanzar error)', () => {
        expect(compararApiKey('corta', 'clave-secreta-mucho-mas-larga')).toBe(false);
    });

    it('retorna false para string vacío contra key no vacía', () => {
        expect(compararApiKey('', 'clave-secreta-123')).toBe(false);
    });

    it('retorna false si apiKey es undefined (header ausente)', () => {
        expect(compararApiKey(undefined, 'clave-secreta-123')).toBe(false);
    });

    it('retorna false si expectedKey no es string', () => {
        expect(compararApiKey('algo', undefined)).toBe(false);
    });

    it('es sensible a mayúsculas/minúsculas', () => {
        expect(compararApiKey('Clave-Secreta-123', 'clave-secreta-123')).toBe(false);
    });
});