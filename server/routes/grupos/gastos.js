const express = require('express');
const { buildNotificacionGrupo } = require('../../services/notificaciones');
const {
    fechaHoyArgentina,
    nombreDesdeAuthUser,
    validarParticipantesYMetodoPago,
    requireAuth,
    notificarMiembros,
    calcularParticipantes,
} = require('./_helpers');

const router = express.Router();

router.param('grupoId', (req, res, next, value) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ ok: false, error: 'ID de grupo inválido' });
    }
    next();
});

router.param('gastoId', (req, res, next, value) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ ok: false, error: 'ID de gasto inválido' });
    }
    next();
});

// ─────────────────────────────────────────────
// POST /api/grupos/:grupoId/gastos — Crea un gasto grupal
// ─────────────────────────────────────────────
router.post('/:grupoId/gastos', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const { supabaseAdmin, user } = req;
    const { descripcion, monto, pagadoPor, fecha, nota, idCategoria, idMetodoPago, participantesUserIds } = req.body;

    if (!descripcion?.trim()) return res.status(400).json({ ok: false, error: 'La descripción es requerida' });
    if (descripcion.trim().length > 500) return res.status(400).json({ ok: false, error: 'La descripción no puede exceder 500 caracteres' });
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });
    if (!pagadoPor) return res.status(400).json({ ok: false, error: 'El pagador es requerido' });
    if (!idMetodoPago) return res.status(400).json({ ok: false, error: 'El método de pago es requerido' });
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        return res.status(400).json({ ok: false, error: 'Se requiere al menos un participante' });
    }

    try {
        // Verificar membresía activa
        const { data: membresia } = await supabaseAdmin
            .from('grupo_miembros').select('id')
            .eq('grupo_id', grupoId).eq('user_id', user.id).eq('estado', 'activo').maybeSingle();
        if (!membresia) return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });

        const { error: errValidacion, participantesUnicos } = await validarParticipantesYMetodoPago(supabaseAdmin, {
            grupoId, pagadoPor, participantesUserIds, idMetodoPago,
        });
        if (errValidacion) return res.status(errValidacion.status).json({ ok: false, error: errValidacion.mensaje });

        const { data: gasto, error: errGasto } = await supabaseAdmin
            .from('grupo_gastos')
            .insert([{
                grupo_id:       Number(grupoId),
                descripcion:    descripcion.trim().toUpperCase(),
                monto:          montoNum,
                pagado_por:     pagadoPor,
                fecha:          `${fecha || fechaHoyArgentina()}T12:00:00-03:00`,
                nota:           nota?.trim() || null,
                id_categoria:   idCategoria || null,
                id_metodo_pago: idMetodoPago,
                creado_por:     user.id,
            }])
            .select()
            .single();

        if (errGasto) {
            console.error('❌ Error al crear gasto grupal:', errGasto.message);
            return res.status(500).json({ ok: false, error: 'Error al crear el gasto' });
        }

        const filas = calcularParticipantes(gasto.id, montoNum, pagadoPor, participantesUnicos);
        const { data: participantes, error: errPart } = await supabaseAdmin
            .from('grupo_gasto_participantes').insert(filas).select();

        if (errPart) {
            // Rollback: anular el gasto huérfano
            await supabaseAdmin.from('grupo_gastos')
                .update({ estado: 'anulado', anulado_en: new Date().toISOString(), anulado_por: user.id })
                .eq('id', gasto.id);
            console.error('❌ Error al insertar participantes (POST /gastos):', errPart.message);
            return res.status(500).json({ ok: false, error: 'Error al registrar participantes' });
        }

        // Obtener datos del grupo y nombre del actor para notificación
        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('gasto_creado', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            descripcion: gasto.descripcion,
            monto:       gasto.monto,
        }), user.id);

        return res.status(201).json({ ok: true, gasto, participantes });
    } catch (err) {
        console.error('❌ Error en POST /gastos:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al crear el gasto' });
    }
});

// ─────────────────────────────────────────────
// PUT /api/grupos/:grupoId/gastos/:gastoId — Edita un gasto grupal
// ─────────────────────────────────────────────
router.put('/:grupoId/gastos/:gastoId', requireAuth, async (req, res) => {
    const { grupoId, gastoId } = req.params;
    const { supabaseAdmin, user } = req;
    const { descripcion, monto, cuotas, pagadoPor, fecha, primeraCuota, nota, idCategoria, idMetodoPago, participantesUserIds } = req.body;

    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        return res.status(400).json({ ok: false, error: 'Se requiere al menos un participante' });
    }
    if (descripcion !== undefined && descripcion.trim().length > 500) {
        return res.status(400).json({ ok: false, error: 'La descripción no puede exceder 500 caracteres' });
    }
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });
    if (!idMetodoPago) return res.status(400).json({ ok: false, error: 'El método de pago es requerido' });

    try {
        // Solo quien pagó puede editar
        const { data: gastoActual } = await supabaseAdmin
            .from('grupo_gastos').select('id, pagado_por, descripcion, monto')
            .eq('id', gastoId).eq('grupo_id', grupoId).eq('estado', 'activo').maybeSingle();
        if (!gastoActual) return res.status(404).json({ ok: false, error: 'Gasto no encontrado o ya anulado' });
        if (gastoActual.pagado_por !== user.id) return res.status(403).json({ ok: false, error: 'Solo quien pagó el gasto puede editarlo' });

        const { error: errValidacion, participantesUnicos } = await validarParticipantesYMetodoPago(supabaseAdmin, {
            grupoId, pagadoPor, participantesUserIds, idMetodoPago,
        });
        if (errValidacion) return res.status(errValidacion.status).json({ ok: false, error: errValidacion.mensaje });

        // Update del gasto + recálculo de fechas de cuotas hermanas + reemplazo de
        // participantes, todo en una sola transacción de Postgres (RPC
        // update_grupo_gasto_installments — ver server/db/migrations/20260722_*.sql).
        // Antes eran 5 pasos no-transaccionales encadenados: si alguno fallaba a
        // mitad de camino, las cuotas quedaban con fechas desincronizadas entre sí,
        // o el gasto quedaba sin participantes.
        const { data: gasto, error: errRpc } = await supabaseAdmin
            .rpc('update_grupo_gasto_installments', {
                p_gasto_id: Number(gastoId),
                p_descripcion: descripcion.trim().toUpperCase(),
                p_monto: montoNum,
                p_pagado_por: pagadoPor,
                p_fecha: fecha || null,
                p_participantes: participantesUnicos,
                p_id_categoria: idCategoria || null,
                p_id_metodo_pago: idMetodoPago,
                p_nota: nota?.trim() || null,
                p_primera_cuota: primeraCuota || null,
                p_cuotas: cuotas ? Math.max(1, Math.min(18, parseInt(cuotas, 10))) : null,
            })
            .single();

        if (errRpc) {
            console.error('❌ Error en update_grupo_gasto_installments:', errRpc.message);
            return res.status(500).json({ ok: false, error: 'Error al actualizar el gasto' });
        }
        if (!gasto) return res.status(404).json({ ok: false, error: 'El gasto no existe o ya fue anulado' });

        const { data: participantes, error: errPart } = await supabaseAdmin
            .from('grupo_gasto_participantes').select().eq('gasto_id', gasto.id);

        if (errPart) {
            console.error('❌ Error al leer participantes tras editar:', errPart.message);
            return res.status(500).json({ ok: false, error: 'Error al leer participantes del gasto' });
        }

        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('gasto_editado', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            descripcion: gasto.descripcion,
            monto:       gasto.monto,
        }), user.id);

        return res.json({ ok: true, gasto, participantes });
    } catch (err) {
        console.error('❌ Error en PUT /gastos/:gastoId:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al actualizar el gasto' });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/grupos/:grupoId/gastos/:gastoId/anular — Anula un gasto grupal
// ─────────────────────────────────────────────
router.patch('/:grupoId/gastos/:gastoId/anular', requireAuth, async (req, res) => {
    const { grupoId, gastoId } = req.params;
    const { supabaseAdmin, user } = req;

    try {
        // Verificar que existe y obtener datos para la notificación
        const { data: gastoActual } = await supabaseAdmin
            .from('grupo_gastos').select('id, pagado_por, descripcion, monto, estado')
            .eq('id', gastoId).eq('grupo_id', grupoId).maybeSingle();
        if (!gastoActual) return res.status(404).json({ ok: false, error: 'Gasto no encontrado' });
        if (gastoActual.estado !== 'activo') return res.status(409).json({ ok: false, error: 'El gasto ya está anulado' });

        // Solo quien pagó puede anular — ni el admin puede anular gastos ajenos
        if (gastoActual.pagado_por !== user.id) {
            return res.status(403).json({ ok: false, error: 'Solo quien pagó el gasto puede anularlo' });
        }

        const { error: errAnular } = await supabaseAdmin
            .from('grupo_gastos')
            .update({ estado: 'anulado', anulado_en: new Date().toISOString(), anulado_por: user.id })
            .eq('id', gastoId)
            .eq('estado', 'activo');

        if (errAnular) {
            console.error('❌ Error al anular gasto:', errAnular.message);
            return res.status(500).json({ ok: false, error: 'Error al anular el gasto' });
        }

        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('gasto_anulado', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            descripcion: gastoActual.descripcion,
            monto:       gastoActual.monto,
        }), user.id);

        return res.json({ ok: true });
    } catch (err) {
        console.error('❌ Error en PATCH /gastos/:gastoId/anular:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al anular el gasto' });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/grupos/:grupoId/gastos/:gastoId/anular-cuotas
// Anula todas las cuotas de una compra grupal en cuotas (por id_gasto_padre).
// Si hay cuotas ya vencidas, requiere { force: true } en el body.
// Solo quien pagó puede anular.
// ─────────────────────────────────────────────
router.patch('/:grupoId/gastos/:gastoId/anular-cuotas', requireAuth, async (req, res) => {
    const { grupoId, gastoId } = req.params;
    const { supabaseAdmin, user } = req;
    const { force = false } = req.body;

    try {
        // Verificar que el gasto padre existe, está activo y pertenece al grupo
        const { data: gastoPadre } = await supabaseAdmin
            .from('grupo_gastos')
            .select('id, pagado_por, descripcion, monto, estado, cuotas, id_gasto_padre')
            .eq('id', gastoId)
            .eq('grupo_id', grupoId)
            .maybeSingle();

        if (!gastoPadre) return res.status(404).json({ ok: false, error: 'Gasto no encontrado' });
        if (gastoPadre.estado === 'anulado') return res.status(409).json({ ok: false, error: 'El gasto ya está anulado' });
        if (gastoPadre.pagado_por !== user.id) {
            return res.status(403).json({ ok: false, error: 'Solo quien pagó el gasto puede anularlo' });
        }

        // El id_gasto_padre para cuotas siempre apunta al primer registro (o a sí mismo)
        const padreId = gastoPadre.id_gasto_padre ?? gastoPadre.id;

        // Obtener todas las cuotas de esta compra
        const { data: todasLasCuotas } = await supabaseAdmin
            .from('grupo_gastos')
            .select('id, fecha, estado')
            .eq('id_gasto_padre', padreId)
            .eq('grupo_id', grupoId);

        const cuotas = todasLasCuotas || [];
        const hoy = fechaHoyArgentina();
        const tieneVencidas = cuotas.some(c => c.estado === 'activo' && (c.fecha || '').split('T')[0] <= hoy);

        // Si hay cuotas vencidas, requerir force explícito
        if (tieneVencidas && !force) {
            return res.status(409).json({
                ok:              false,
                error:           'Esta compra tiene cuotas ya vencidas. Confirmá con force: true para anular igualmente.',
                tieneVencidas:   true,
                cuotasVencidas:  cuotas.filter(c => (c.fecha || '').split('T')[0] <= hoy).length,
                cuotasTotales:   cuotas.length,
            });
        }

        // Anular todas las cuotas activas del grupo
        const ahora = new Date().toISOString();
        const { error: errAnular } = await supabaseAdmin
            .from('grupo_gastos')
            .update({ estado: 'anulado', anulado_en: ahora, anulado_por: user.id })
            .eq('id_gasto_padre', padreId)
            .eq('grupo_id', grupoId)
            .eq('estado', 'activo');

        if (errAnular) {
            console.error('❌ Error al anular cuotas grupales:', errAnular.message);
            return res.status(500).json({ ok: false, error: 'Error al anular las cuotas' });
        }

        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';
        const descBase = gastoPadre.descripcion.replace(/\s*\(\d+\/\d+\)$/, '');

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('gasto_anulado', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            descripcion: descBase,
            monto:       gastoPadre.monto,
        }), user.id);

        return res.json({ ok: true, cuotasAnuladas: cuotas.length });
    } catch (err) {
        console.error('❌ Error en PATCH /gastos/:gastoId/anular-cuotas:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al anular las cuotas' });
    }
});

// ─────────────────────────────────────────────
// POST /api/grupos/:grupoId/gastos-cuotas — Crea un gasto grupal en cuotas con tarjeta
// Body: { descripcion, monto, cuotas, pagadoPor, fecha, nota, idCategoria, participantesUserIds }
// Genera una fila en grupo_gastos por cada cuota, vinculadas por id_gasto_padre.
// Los participantes y sus montos se registran en grupo_gasto_participantes para cada cuota.
// ─────────────────────────────────────────────
router.post('/:grupoId/gastos-cuotas', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const { supabaseAdmin, user } = req;
    const {
        descripcion,
        monto,
        cuotas: cuotasRaw,
        pagadoPor,
        fecha,
        primeraCuota,
        nota,
        idCategoria,
        idMetodoPago,
        participantesUserIds,
    } = req.body;

    // Validaciones de entrada
    if (!descripcion?.trim()) return res.status(400).json({ ok: false, error: 'La descripción es requerida' });
    if (descripcion.trim().length > 500) return res.status(400).json({ ok: false, error: 'La descripción no puede exceder 500 caracteres' });
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });
    const cantCuotas = Math.max(1, Math.min(18, parseInt(cuotasRaw, 10) || 1));
    if (!pagadoPor) return res.status(400).json({ ok: false, error: 'El pagador es requerido' });
    if (!primeraCuota || !/^\d{4}-\d{2}$/.test(primeraCuota.slice(0, 7))) {
        return res.status(400).json({ ok: false, error: 'Indicá en qué mes vence la primera cuota (YYYY-MM)' });
    }
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        return res.status(400).json({ ok: false, error: 'Se requiere al menos un participante' });
    }
    if (!idMetodoPago) return res.status(400).json({ ok: false, error: 'El método de pago es requerido' });

    try {
        // Verificar membresía activa
        const { data: membresia } = await supabaseAdmin
            .from('grupo_miembros').select('id')
            .eq('grupo_id', grupoId).eq('user_id', user.id).eq('estado', 'activo').maybeSingle();
        if (!membresia) return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });

        const { error: errValidacion, participantesUnicos } = await validarParticipantesYMetodoPago(supabaseAdmin, {
            grupoId, pagadoPor, participantesUserIds, idMetodoPago, requiereCuotas: true,
        });
        if (errValidacion) return res.status(errValidacion.status).json({ ok: false, error: errValidacion.mensaje });

        const descripcionBase = descripcion.trim().toUpperCase();

        // Todas las cuotas y sus participantes se insertan en una sola transacción
        // de Postgres (RPC create_grupo_gasto_installments — ver
        // server/db/migrations/20260721_*.sql). Antes esto eran 3 pasos separados
        // (insert cuota 1 -> insert cuotas 2..N -> insert participantes) con
        // rollback manual vía UPDATE estado='anulado': si el proceso perdía
        // conexión a mitad de camino, quedaban cuotas grupales huérfanas o con
        // participantes parciales. El RPC garantiza todo-o-nada.
        const { data: todosLosGastos, error: errRpc } = await supabaseAdmin.rpc('create_grupo_gasto_installments', {
            p_grupo_id: Number(grupoId),
            p_descripcion: descripcionBase,
            p_monto_total: montoNum,
            p_cuotas: cantCuotas,
            p_fecha_primera_cuota: primeraCuota,
            p_pagado_por: pagadoPor,
            p_creado_por: user.id,
            p_participantes: participantesUnicos,
            p_id_categoria: idCategoria || null,
            p_id_metodo_pago: idMetodoPago,
            p_nota: nota?.trim() || null,
        });

        if (errRpc) {
            console.error('❌ Error en create_grupo_gasto_installments:', errRpc.message);
            return res.status(500).json({ ok: false, error: 'Error al crear el gasto en cuotas' });
        }
        if (!todosLosGastos?.length) {
            return res.status(500).json({ ok: false, error: 'Error al crear el gasto en cuotas' });
        }

        const primera = todosLosGastos[0];
        const idsGastos = todosLosGastos.map(g => g.id);
        const { data: participantes, error: errPart } = await supabaseAdmin
            .from('grupo_gasto_participantes').select().in('gasto_id', idsGastos);

        if (errPart) {
            console.error('❌ Error al leer participantes de cuotas recién creadas:', errPart.message);
            return res.status(500).json({ ok: false, error: 'Error al leer participantes del gasto' });
        }

        // Notificar miembros del grupo (sin bloquear respuesta)
        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('gasto_creado', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            descripcion: descripcionBase,
            monto:       montoNum,
        }), user.id);

        return res.status(201).json({
            ok:           true,
            gasto:        primera,
            gastos:       todosLosGastos,
            participantes,
        });
    } catch (err) {
        console.error('❌ Error en POST /gastos-cuotas:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al crear el gasto en cuotas' });
    }
});

module.exports = router;
