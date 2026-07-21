const express = require('express');
const { persistirNotificacion, actualizarEstadoEmailDb, getConfigUsuario } = require('../../services/notificacionesDb');
const { procesarEnvioEmail } = require('../../services/notificaciones');
const {
    nombreDesdeAuthUser,
    validarAdminGrupo,
    requireAuth,
} = require('./_helpers');

const router = express.Router();

router.param('grupoId', (req, res, next, value) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ ok: false, error: 'ID de grupo inválido' });
    }
    next();
});

// ─────────────────────────────────────────────
// DELETE /api/grupos/:grupoId — Elimina un grupo
// Solo admins. Solo si todos los saldos son cero.
// ─────────────────────────────────────────────
router.delete('/:grupoId', requireAuth, async (req, res) => {
    const { grupoId } = req.params;
    const userId = req.user.id;
    const supabaseAdmin = req.supabaseAdmin;

    try {
        // Verificar que el solicitante es miembro activo del grupo
        const { data: membresia, error: errMembresia } = await supabaseAdmin
            .from('grupo_miembros')
            .select('id')
            .eq('grupo_id', grupoId)
            .eq('user_id', userId)
            .eq('estado', 'activo')
            .maybeSingle();

        if (errMembresia) {
            console.error('❌ Error al verificar membresía:', errMembresia.message);
            return res.status(500).json({ ok: false, error: 'Error al verificar membresía' });
        }

        if (!membresia) {
            return res.status(403).json({ ok: false, error: 'No sos miembro activo de este grupo' });
        }

        // Solo admins pueden eliminar el grupo
        const esAdmin = await validarAdminGrupo(supabaseAdmin, grupoId, userId);
        if (!esAdmin) {
            return res.status(403).json({ ok: false, error: 'Solo los admins pueden eliminar el grupo' });
        }

        // Obtener datos del grupo y miembros activos antes de eliminar
        const [{ data: grupo, error: errGrupo }, { data: miembros, error: errMiembros }] = await Promise.all([
            supabaseAdmin.from('grupos_gastos').select('id, nombre').eq('id', grupoId).maybeSingle(),
            supabaseAdmin.from('grupo_miembros').select('user_id').eq('grupo_id', grupoId).eq('estado', 'activo'),
        ]);

        if (errGrupo || errMiembros) {
            console.error('❌ Error al obtener datos del grupo:', errGrupo?.message || errMiembros?.message);
            return res.status(500).json({ ok: false, error: 'Error al obtener datos del grupo' });
        }

        // Verificar que todos los saldos netos son cero
        const { data: saldos, error: errSaldos } = await supabaseAdmin
            .from('vw_grupo_saldos')
            .select('user_id, saldo_neto')
            .eq('grupo_id', grupoId);

        if (errSaldos) {
            console.error('❌ Error al consultar saldos:', errSaldos.message);
            return res.status(500).json({ ok: false, error: 'Error al verificar saldos del grupo' });
        }

        const saldosPendientes = (saldos || []).filter((s) => Math.abs(s.saldo_neto) > 0.01);
        if (saldosPendientes.length > 0) {
            return res.status(422).json({
                ok: false,
                error: 'No se puede eliminar el grupo porque hay saldos pendientes. Liquidá todas las deudas antes de eliminar.',
            });
        }

        // Obtener nombre del usuario que elimina para la notificación
        let nombreEliminador = null;
        try {
            const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
            nombreEliminador = nombreDesdeAuthUser(authData?.user) || req.user.email?.split('@')[0] || 'Un miembro';
        } catch {
            nombreEliminador = 'Un miembro';
        }

        // Eliminar el grupo — FK CASCADE elimina miembros, gastos, invitaciones
        const { error: errDel } = await supabaseAdmin
            .from('grupos_gastos')
            .delete()
            .eq('id', grupoId);

        if (errDel) {
            console.error('❌ Error al eliminar grupo:', errDel.message);
            return res.status(500).json({ ok: false, error: 'No se pudo eliminar el grupo' });
        }

        // Notificar a todos los miembros — fire-and-forget, nunca interrumpe la respuesta
        const nombreGrupo = grupo?.nombre || 'Grupo eliminado';
        const notificacion = {
            titulo:  'Grupo eliminado',
            mensaje: `El grupo "${nombreGrupo}" fue eliminado por ${nombreEliminador}.`,
            tipo:    'warning',
            origen:  'grupos',
            metadata: { grupo: nombreGrupo, eliminado_por: nombreEliminador },
        };

        Promise.allSettled((miembros || []).map(async (m) => {
            const creada = await persistirNotificacion(m.user_id, notificacion);
            if (!creada) return;

            try {
                const { data: authData } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
                const emailMiembro = authData?.user?.email || null;
                if (!emailMiembro) return;

                const config = await getConfigUsuario(m.user_id);
                if (!config?.email_habilitado) return;

                const { emailEnviado, emailError } = await procesarEnvioEmail(emailMiembro, creada, config);
                await actualizarEstadoEmailDb(creada.id, emailEnviado, emailError || null);
            } catch (err) {
                console.error(`❌ Error al notificar miembro ${m.user_id}:`, err.message);
            }
        })).catch(() => {});

        return res.json({ ok: true });

    } catch (err) {
        console.error('❌ Error en DELETE /grupos/:grupoId:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno al eliminar el grupo' });
    }
});

module.exports = router;
