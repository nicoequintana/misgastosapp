const express = require('express');
const { buildNotificacionGrupo } = require('../../services/notificaciones');
const {
    UUID_REGEX,
    fechaHoyArgentina,
    nombreDesdeAuthUser,
    validarAdminGrupo,
    requireAuth,
    notificarMiembros,
} = require('./_helpers');

const router = express.Router();

router.param('grupoId', (req, res, next, value) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ ok: false, error: 'ID de grupo inválido' });
    }
    next();
});

router.param('liqId', (req, res, next, value) => {
    if (!UUID_REGEX.test(value)) {
        return res.status(400).json({ ok: false, error: 'ID de liquidación inválido' });
    }
    next();
});

// ─────────────────────────────────────────────
// POST /api/grupos/:grupoId/liquidaciones — Registra una liquidación
// ─────────────────────────────────────────────
router.post('/:grupoId/liquidaciones', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const { supabaseAdmin, user } = req;
    const { deUserId, paraUserId, monto, fecha, nota } = req.body;

    if (!deUserId || !paraUserId) return res.status(400).json({ ok: false, error: 'deUserId y paraUserId son requeridos' });
    if (deUserId === paraUserId) return res.status(400).json({ ok: false, error: 'El pagador y el receptor no pueden ser la misma persona' });
    if (deUserId !== req.user.id) return res.status(403).json({ ok: false, error: 'Solo podés registrar pagos que vos realizaste' });
    // Fix S-01: paraUserId antes no se validaba como UUID ni como miembro del grupo,
    // permitiendo fabricar liquidaciones falsas contra cualquier ID arbitrario y
    // falsear el saldo propio en vw_grupo_saldos. Se exige el mismo formato que el resto de IDs de usuario.
    if (!UUID_REGEX.test(paraUserId)) return res.status(400).json({ ok: false, error: 'paraUserId contiene un ID inválido' });
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ ok: false, error: 'El monto debe ser mayor a cero' });

    try {
        // Verificar membresía activa del caller Y del receptor (paraUserId) en una sola consulta.
        const { data: miembrosActivos } = await supabaseAdmin
            .from('grupo_miembros').select('user_id')
            .eq('grupo_id', grupoId).eq('estado', 'activo').in('user_id', [user.id, paraUserId]);
        const idsActivos = new Set((miembrosActivos || []).map(m => m.user_id));
        if (!idsActivos.has(user.id)) return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });
        if (!idsActivos.has(paraUserId)) return res.status(400).json({ ok: false, error: 'El receptor no es miembro activo del grupo' });

        const { data: liquidacion, error: errLiq } = await supabaseAdmin
            .from('grupo_liquidaciones')
            .insert([{
                grupo_id:      Number(grupoId),
                de_user_id:    deUserId,
                para_user_id:  paraUserId,
                monto:         montoNum,
                fecha:         fecha || fechaHoyArgentina(),
                nota:          nota?.trim() || null,
                estado:        'confirmada',
                registrado_por: user.id,
            }])
            .select()
            .single();

        if (errLiq) {
            console.error('❌ Error al registrar liquidación:', errLiq.message);
            return res.status(500).json({ ok: false, error: 'Error al registrar la liquidación' });
        }

        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('liquidacion_registrada', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            monto:       montoNum,
            de_user_id:  deUserId,
            para_user_id: paraUserId,
        }), user.id);

        return res.status(201).json({ ok: true, liquidacion });
    } catch (err) {
        console.error('❌ Error en POST /liquidaciones:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al registrar la liquidación' });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/grupos/:grupoId/liquidaciones/:liqId/anular — Anula una liquidación
// ─────────────────────────────────────────────
router.patch('/:grupoId/liquidaciones/:liqId/anular', requireAuth, async (req, res) => {
    const { grupoId, liqId } = req.params;
    const { supabaseAdmin, user } = req;

    try {
        const { data: liq } = await supabaseAdmin
            .from('grupo_liquidaciones').select('id, registrado_por, monto, estado')
            .eq('id', liqId).eq('grupo_id', grupoId).maybeSingle();
        if (!liq) return res.status(404).json({ ok: false, error: 'Liquidación no encontrada' });
        if (liq.estado !== 'confirmada') return res.status(409).json({ ok: false, error: 'La liquidación ya está anulada' });

        const esAdmin = await validarAdminGrupo(supabaseAdmin, grupoId, user.id);
        if (liq.registrado_por !== user.id && !esAdmin) {
            return res.status(403).json({ ok: false, error: 'Solo quien registró la liquidación o un admin puede anularla' });
        }

        const { error: errAnular } = await supabaseAdmin
            .from('grupo_liquidaciones')
            .update({ estado: 'anulada', anulada_en: new Date().toISOString() })
            .eq('id', liqId)
            .eq('estado', 'confirmada');

        if (errAnular) {
            console.error('❌ Error al anular liquidación:', errAnular.message);
            return res.status(500).json({ ok: false, error: 'Error al anular la liquidación' });
        }

        const [{ data: grupo }, { data: authData }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.auth.admin.getUserById(user.id),
        ]);
        const actorNombre = nombreDesdeAuthUser(authData?.user) || user.email?.split('@')[0] || 'Un miembro';

        notificarMiembros(supabaseAdmin, grupoId, buildNotificacionGrupo('liquidacion_anulada', {
            grupoNombre: grupo?.nombre || '',
            actorNombre,
            monto:       liq.monto,
        }), user.id);

        return res.json({ ok: true });
    } catch (err) {
        console.error('❌ Error en PATCH /liquidaciones/:liqId/anular:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al anular la liquidación' });
    }
});

module.exports = router;
