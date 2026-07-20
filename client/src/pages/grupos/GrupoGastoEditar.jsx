import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGrupoGastoForm } from '../../hooks/useGrupoGastoForm';
import GrupoGastoForm from '../../components/grupos/GrupoGastoForm';
import * as db from '../../lib/db';

/**
 * Página para editar un gasto grupal existente.
 * Carga el gasto con sus participantes actuales y permite modificar todos los campos.
 *
 * Ruta: /grupos/:id/gastos/:gastoId/editar
 */
const GrupoGastoEditar = () => {
    const { id: grupoId, gastoId } = useParams();
    const navigate = useNavigate();

    const form = useGrupoGastoForm({ grupoId, gastoId, modo: 'editar' });
    const { esTarjeta, primeraCuota, cuotas } = form;

    const volverAlDetalle = () => navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } });

    const handleSubmit = (e) => form.handleSubmit(e, {
        onSubmit: () => db.actualizarGastoGrupal(gastoId, {
            grupoId,
            descripcion: form.descripcion,
            monto: form.monto,
            cuotas: esTarjeta ? cuotas : undefined,
            pagadoPor: form.pagadoPor,
            fecha: form.fecha,
            primeraCuota: esTarjeta ? primeraCuota : undefined,
            idCategoria: form.categoriaId ? Number(form.categoriaId) : undefined,
            idMetodoPago: Number(form.metodoPagoId),
            nota: form.nota || undefined,
            participantesUserIds: form.participantes,
        }),
        mensajeExito: 'Gasto actualizado',
        mensajeErrorTitulo: 'No se pudo actualizar el gasto',
    });

    const handleContinuar = () => {
        if (form.resultado?.tipo === 'success') {
            volverAlDetalle();
        } else {
            form.volverAFormulario();
        }
    };

    return (
        <GrupoGastoForm
            form={form}
            titulo="Editar gasto"
            tituloGuardando="Guardando cambios..."
            textoBotonSubmit="Guardar cambios"
            onSubmit={handleSubmit}
            onCancelar={volverAlDetalle}
            onContinuar={handleContinuar}
        />
    );
};

export default GrupoGastoEditar;
