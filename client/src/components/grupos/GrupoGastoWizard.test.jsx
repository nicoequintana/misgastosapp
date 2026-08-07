import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GrupoGastoWizard from './GrupoGastoWizard';
import { AuthContext } from '../../context/AuthContext';
import * as db from '../../lib/db';

vi.mock('../../lib/db');

const MIEMBROS = [
    { user_id: 'u1', estado: 'activo', alias: 'Nico' },
    { user_id: 'u2', estado: 'activo', alias: 'Ana' },
];
const CATEGORIAS = [
    { id: 1, nombre: 'COMIDA', icono: 'restaurant', es_propia: false },
];
const METODOS_PAGO = [
    { id: 10, nombre: 'EFECTIVO', icono: 'payments', acepta_cuotas: false },
    { id: 20, nombre: 'VISA', icono: 'credit_card', acepta_cuotas: true },
];

function renderWizard(props = {}) {
    return render(
        <AuthContext.Provider value={{ user: { id: 'u1' } }}>
            <GrupoGastoWizard
                isOpen={true}
                onClose={vi.fn()}
                grupoId={1}
                onGastoGuardado={vi.fn()}
                {...props}
            />
        </AuthContext.Provider>
    );
}

/**
 * El wizard deshabilita brevemente (400ms) los botones de navegación al cambiar de
 * paso (ver DURACION_BLOQUEO_PASO_MS en GrupoGastoWizard.jsx, mismo criterio que
 * GastoWizard.jsx) para evitar doble-click accidental. Esperamos a que se rehabilite
 * antes de clickear, igual que haría un usuario real.
 */
async function clickCuandoHabilitado(boton) {
    await waitFor(() => expect(boton).not.toBeDisabled());
    fireEvent.click(boton);
}

beforeEach(() => {
    // Modal.jsx renderiza via createPortal a #modal-root — debe existir en el DOM
    // *antes* de montar el árbol (mismo patrón que GastoWizard.test.jsx y Modal.test.jsx),
    // no como hermano dentro del mismo render() porque el portal resuelve el contenedor
    // de forma síncrona en el primer commit.
    document.body.innerHTML = '<div id="modal-root"></div>';
    vi.clearAllMocks();
    db.obtenerMiembrosDelGrupo.mockResolvedValue(MIEMBROS);
    db.getCategories.mockResolvedValue(CATEGORIAS);
    db.getPaymentMethods.mockResolvedValue(METODOS_PAGO);
    db.crearGastoGrupal.mockResolvedValue({ gasto: { id: 1 }, participantes: [] });
    db.crearGastoGrupalEnCuotas.mockResolvedValue({ gasto: { id: 1 }, gastos: [], participantes: [] });
});

describe('GrupoGastoWizard — paso 1 (monto/descripción)', () => {
    it('muestra paso 1 de 5 al abrir', async () => {
        renderWizard();
        await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
        expect(screen.getByLabelText(/Monto/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Descripción/i)).toBeInTheDocument();
    });

    it('bloquea avanzar si el monto es cero', async () => {
        renderWizard();
        await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));
        expect(await screen.findByText(/El monto debe ser mayor a cero/i)).toBeInTheDocument();
        expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument();
    });

    it('bloquea avanzar si la descripción está vacía', async () => {
        renderWizard();
        await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));
        expect(await screen.findByText(/La descripción es obligatoria/i)).toBeInTheDocument();
    });

    it('avanza a paso 2 con monto y descripción válidos', async () => {
        renderWizard();
        await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        fireEvent.change(screen.getByLabelText(/Descripción/i), { target: { value: 'Cena' } });
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument());
        expect(await screen.findByText('COMIDA')).toBeInTheDocument();
    });
});

async function avanzarHastaPaso3() {
    await waitFor(() => expect(screen.getByText('Paso 1 de 5')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/Descripción/i), { target: { value: 'Cena' } });
    await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument());
    fireEvent.click(await screen.findByText('EFECTIVO'));
    await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));
    await waitFor(() => expect(screen.getByText('Paso 3 de 5')).toBeInTheDocument());
}

describe('GrupoGastoWizard — paso 3 (pagado por)', () => {
    it('muestra el select de pagado por con el usuario actual precargado', async () => {
        renderWizard();
        await avanzarHastaPaso3();
        expect(screen.getByLabelText(/Pagó/i)).toHaveValue('u1');
    });

    it('bloquea avanzar si no hay pagador seleccionado', async () => {
        renderWizard();
        await avanzarHastaPaso3();
        fireEvent.change(screen.getByLabelText(/Pagó/i), { target: { value: '' } });
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));
        expect(await screen.findByText('Seleccioná quién pagó.')).toBeInTheDocument();
    });

    it('avanza a paso 4 con pagador seleccionado', async () => {
        renderWizard();
        await avanzarHastaPaso3();
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));
        await waitFor(() => expect(screen.getByText('Paso 4 de 5')).toBeInTheDocument());
    });
});
