import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGrupoGastoForm } from '../../hooks/useGrupoGastoForm';
import GrupoGastoForm from '../../components/grupos/GrupoGastoForm';
import * as db from '../../lib/db';

/**
 * Página para registrar un nuevo gasto dentro de un grupo de gastos compartidos.
 * Carga los miembros activos del grupo, muestra un formulario completo
 * y calcula en tiempo real cuánto le corresponde a cada participante.
 *
 * Ruta: /grupos/:id/gastos/nuevo
 */
const GrupoGastoNuevo = () => {
    const { id: grupoId } = useParams();
    const navigate = useNavigate();

    const form = useGrupoGastoForm({ grupoId, modo: 'crear' });
    const { esTarjeta, cuotas, primeraCuota } = form;

    const handleSubmit = (e) => form.handleSubmit(e, {
        onSubmit: async () => {
            const params = {
                grupoId: Number(grupoId),
                descripcion: form.descripcion,
                monto: form.monto,
                pagadoPor: form.pagadoPor,
                fecha: form.fecha,
                idCategoria: form.categoriaId ? Number(form.categoriaId) : undefined,
                idMetodoPago: Number(form.metodoPagoId),
                nota: form.nota || undefined,
                participantesUserIds: form.participantes,
            };

            if (esTarjeta) {
                await db.crearGastoGrupalEnCuotas({ ...params, cuotas, primeraCuota });
            } else {
                await db.crearGastoGrupal(params);
            }
        },
        mensajeExito: '¡Gasto registrado!',
        mensajeErrorTitulo: 'No se pudo registrar el gasto',
    });

    const handleContinuar = () => {
        if (form.resultado?.tipo === 'success') {
            navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } });
        } else {
            form.volverAFormulario();
        }
    };

    return (
        <GrupoGastoForm
            form={form}
            titulo="Cargar gasto"
            tituloGuardando="Guardando gasto..."
            textoBotonSubmit="Guardar gasto"
            onSubmit={handleSubmit}
            onCancelar={() => navigate(`/grupos/${grupoId}`)}
            onContinuar={handleContinuar}
        />
    );
};

export default GrupoGastoNuevo;
