/**
 * Tests para el servicio de notificaciones.
 * Cubre: buildNotificacionGrupo, buildNotificacionGasto, determinarSiEnviarEmail.
 * No depende de Supabase ni SMTP — pura lógica.
 */

const { buildNotificacionGasto, buildNotificacionGrupo, determinarSiEnviarEmail } = require('../services/notificaciones');

describe('buildNotificacionGrupo', () => {
    const base = { grupoNombre: 'Vacaciones', actorNombre: 'Nico' };

    it('gasto_creado: origen grupos, tipo info', () => {
        const n = buildNotificacionGrupo('gasto_creado', { ...base, descripcion: 'PIZZA', monto: 1200 });
        expect(n.origen).toBe('grupos');
        expect(n.tipo).toBe('info');
        expect(n.titulo).toBe('Nuevo gasto en el grupo');
        expect(n.mensaje).toContain('PIZZA');
        expect(n.mensaje).toContain('Vacaciones');
        expect(n.mensaje).toContain('Nico');
    });

    it('gasto_editado: tipo info', () => {
        const n = buildNotificacionGrupo('gasto_editado', { ...base, descripcion: 'TAXI', monto: 500 });
        expect(n.tipo).toBe('info');
        expect(n.titulo).toBe('Gasto modificado en el grupo');
        expect(n.mensaje).toContain('TAXI');
    });

    it('gasto_anulado: tipo warning', () => {
        const n = buildNotificacionGrupo('gasto_anulado', { ...base, descripcion: 'HOTEL', monto: 3000 });
        expect(n.tipo).toBe('warning');
        expect(n.titulo).toBe('Gasto anulado en el grupo');
    });

    it('liquidacion_registrada: tipo success', () => {
        const n = buildNotificacionGrupo('liquidacion_registrada', { ...base, monto: 800 });
        expect(n.tipo).toBe('success');
        expect(n.titulo).toBe('Liquidación registrada');
        expect(n.mensaje).toContain('800');
    });

    it('liquidacion_anulada: tipo warning', () => {
        const n = buildNotificacionGrupo('liquidacion_anulada', { ...base, monto: 200 });
        expect(n.tipo).toBe('warning');
        expect(n.titulo).toBe('Liquidación anulada');
    });

    it('miembro_unido: tipo info', () => {
        const n = buildNotificacionGrupo('miembro_unido', { ...base });
        expect(n.tipo).toBe('info');
        expect(n.titulo).toBe('Nuevo miembro en el grupo');
    });

    it('evento desconocido: retorna fallback genérico', () => {
        const n = buildNotificacionGrupo('evento_inventado', base);
        expect(n.titulo).toBe('Actividad en el grupo');
        expect(n.origen).toBe('grupos');
    });

    it('siempre incluye metadata con los datos recibidos', () => {
        const datos = { ...base, descripcion: 'X', monto: 100 };
        const n = buildNotificacionGrupo('gasto_creado', datos);
        expect(n.metadata).toBeDefined();
        expect(n.metadata.grupoNombre).toBe('Vacaciones');
        expect(n.metadata.actorNombre).toBe('Nico');
    });
});

describe('buildNotificacionGasto', () => {
    it('creado: origen gastos, tipo success', () => {
        const n = buildNotificacionGasto('creado', { descripcion: 'CENA', monto: 500 });
        expect(n.origen).toBe('gastos');
        expect(n.tipo).toBe('success');
        expect(n.mensaje).toContain('CENA');
    });

    it('editado: tipo info', () => {
        const n = buildNotificacionGasto('editado', { descripcion: 'CENA', monto: 600 });
        expect(n.tipo).toBe('info');
    });

    it('eliminado: tipo warning', () => {
        const n = buildNotificacionGasto('eliminado', { descripcion: 'ALQUILER', monto: 20000 });
        expect(n.tipo).toBe('warning');
    });

    it('accion desconocida: retorna fallback', () => {
        const n = buildNotificacionGasto('algo_raro');
        expect(n.titulo).toBe('Operación realizada');
    });

    it('metadata incluye descripcion y monto cuando se pasa gasto', () => {
        const n = buildNotificacionGasto('creado', { descripcion: 'SUPER', monto: 1000 });
        expect(n.metadata.descripcion).toBe('SUPER');
        expect(n.metadata.monto).toContain('1.000');
    });
});

describe('determinarSiEnviarEmail', () => {
    const configHabilitada = { email_habilitado: true, email_notificaciones_n8n: true, email_resumen_diario: true };

    it('origen grupos: siempre true (transaccional)', () => {
        expect(determinarSiEnviarEmail({ origen: 'grupos' }, {})).toBe(true);
        expect(determinarSiEnviarEmail({ origen: 'grupos' }, { email_habilitado: false })).toBe(true);
    });

    it('origen n8n: solo si email_notificaciones_n8n está habilitado', () => {
        expect(determinarSiEnviarEmail({ origen: 'n8n' }, { email_notificaciones_n8n: true })).toBe(true);
        expect(determinarSiEnviarEmail({ origen: 'n8n' }, { email_notificaciones_n8n: false })).toBe(false);
    });

    it('origen ingresos: solo si email_habilitado está en true', () => {
        expect(determinarSiEnviarEmail({ origen: 'ingresos' }, { email_habilitado: true })).toBe(true);
        expect(determinarSiEnviarEmail({ origen: 'ingresos' }, { email_habilitado: false })).toBe(false);
    });

    it('origen gastos (default): false', () => {
        expect(determinarSiEnviarEmail({ origen: 'gastos' }, configHabilitada)).toBe(false);
    });

    it('origen desconocido: false', () => {
        expect(determinarSiEnviarEmail({ origen: 'xyz' }, configHabilitada)).toBe(false);
    });
});
