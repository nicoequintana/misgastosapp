/**
 * Tests de humo para GastoWizard — extraído de Dashboard.jsx en el refactor R6.
 * Cubren el flujo completo del wizard de 3 pasos y la fase de resultado (éxito/error),
 * ahora unificada con ResultModal (UX-14).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GastoWizard from './GastoWizard';
import * as db from '../../lib/db';

vi.mock('../../lib/db');

const CATEGORIAS = [
    { id: 1, nombre: 'COMIDA', icono: 'restaurant', es_prestamo: false },
];
const METODOS_PAGO = [
    { id: 10, nombre: 'EFECTIVO', icono: 'payments', acepta_cuotas: false },
];

function renderWizard(props = {}) {
    return render(
        <GastoWizard
            isOpen={true}
            onClose={() => {}}
            categories={CATEGORIAS}
            paymentMethods={METODOS_PAGO}
            errorOpciones={null}
            fetchOpciones={() => {}}
            tipoPreseleccionado={false}
            esFijoPreseleccionado={false}
            onGastoGuardado={() => {}}
            {...props}
        />
    );
}

/**
 * El wizard deshabilita brevemente (400ms) los botones de navegación al cambiar de
 * paso (ver DURACION_BLOQUEO_PASO_MS en GastoWizard.jsx) para evitar doble-click.
 * Esperamos a que se rehabilite antes de clickear, igual que haría un usuario real.
 */
async function clickCuandoHabilitado(boton) {
    await waitFor(() => expect(boton).not.toBeDisabled());
    fireEvent.click(boton);
}

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-root"></div>';
    vi.clearAllMocks();
    db.createExpense.mockResolvedValue({ id: 1 });
});

describe('GastoWizard', () => {
    it('completa los 3 pasos y guarda el gasto exitosamente', async () => {
        const onGastoGuardado = vi.fn().mockResolvedValue();
        renderWizard({ onGastoGuardado });

        // Paso 1: monto
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));

        // Paso 2: categoría y método de pago
        await screen.findByText('COMIDA');
        fireEvent.click(screen.getByText('COMIDA'));
        fireEvent.click(screen.getByText('EFECTIVO'));
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));

        // Paso 3: tipo de gasto (variable por defecto) → Guardar
        await screen.findByText('Variable');
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Guardar/i }));

        expect(await screen.findByText('¡Gasto registrado!')).toBeInTheDocument();
        expect(db.createExpense).toHaveBeenCalledWith(expect.objectContaining({ id_categoria: 1, id_metodo_pago: 10 }));
        await waitFor(() => expect(onGastoGuardado).toHaveBeenCalled());
    });

    it('muestra error de validación si el monto es cero y no avanza de paso', async () => {
        renderWizard();
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));
        expect(await screen.findByText(/El monto debe ser mayor a cero/i)).toBeInTheDocument();
    }, 10000);

    it('muestra error inline al perder foco del monto en cero (on-blur)', async () => {
        renderWizard();
        const inputMonto = screen.getByLabelText(/Monto/i);
        fireEvent.blur(inputMonto);
        expect(await screen.findByText(/El monto debe ser mayor a cero/i)).toBeInTheDocument();
    });

    it('limpia el error inline del monto en cuanto el usuario cambia el valor', async () => {
        renderWizard();
        const inputMonto = screen.getByLabelText(/Monto/i);
        fireEvent.blur(inputMonto);
        expect(await screen.findByText(/El monto debe ser mayor a cero/i)).toBeInTheDocument();

        fireEvent.change(inputMonto, { target: { value: '1000' } });
        expect(screen.queryByText(/El monto debe ser mayor a cero/i)).not.toBeInTheDocument();
    });

    it('muestra error inline al perder foco de primeraCuota sin completar (tarjeta)', async () => {
        const METODOS_TARJETA = [
            { id: 20, nombre: 'VISA', icono: 'credit_card', acepta_cuotas: true },
        ];
        renderWizard({ paymentMethods: METODOS_TARJETA });

        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));

        await screen.findByText('COMIDA');
        fireEvent.click(screen.getByText('COMIDA'));
        fireEvent.click(screen.getByText('VISA'));

        const inputPrimeraCuota = await screen.findByLabelText(/primera cuota/i);
        fireEvent.blur(inputPrimeraCuota);
        expect(await screen.findByText(/Indicá en qué mes vence la primera cuota/i)).toBeInTheDocument();

        fireEvent.change(inputPrimeraCuota, { target: { value: '2026-08' } });
        expect(screen.queryByText(/Indicá en qué mes vence la primera cuota/i)).not.toBeInTheDocument();
    });

    it('muestra fase de resultado con error (vía ResultModal) cuando falla el guardado', async () => {
        db.createExpense.mockRejectedValue(new Error('Error de red'));
        renderWizard();

        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));

        await screen.findByText('COMIDA');
        fireEvent.click(screen.getByText('COMIDA'));
        fireEvent.click(screen.getByText('EFECTIVO'));
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));

        await screen.findByText('Variable');
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Guardar/i }));

        expect(await screen.findByText('No se pudo guardar el gasto')).toBeInTheDocument();
        expect(screen.getByText('Error de red')).toBeInTheDocument();
        // El botón "Continuar" viene de ResultModal (UX-14): confirma que se unificó el popup.
        expect(screen.getByRole('button', { name: /Continuar/i })).toBeInTheDocument();
    });

    it('salta el paso de fijo/variable cuando se abre con tipo preseleccionado', async () => {
        const onGastoGuardado = vi.fn().mockResolvedValue();
        renderWizard({ tipoPreseleccionado: true, esFijoPreseleccionado: true, onGastoGuardado });

        expect(screen.getByText('Paso 1 de 2')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '500' } });
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));

        await screen.findByText('COMIDA');
        fireEvent.click(screen.getByText('COMIDA'));
        fireEvent.click(screen.getByText('EFECTIVO'));

        // En paso 2 de 2 el botón pasa a ser "Guardar" directamente (sin paso 3).
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Guardar/i }));

        expect(await screen.findByText('¡Gasto registrado!')).toBeInTheDocument();
        expect(db.createExpense).toHaveBeenCalledWith(expect.objectContaining({ es_fijo: true, tipoPreseleccionado: true }));
    });
});
