/**
 * Tests de humo para IngresoModal — extraído de Dashboard.jsx en el refactor R6.
 * Cubren la vista de lista, el wizard de 2 pasos, y la fase de resultado (éxito/error),
 * ahora unificada con ResultModal (UX-14).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import IngresoModal from './IngresoModal';
import * as db from '../../lib/db';

vi.mock('../../lib/db');
vi.mock('../../context/NotificacionesContext', () => ({
    useNotificaciones: () => ({ agregarNotificacion: vi.fn() }),
}));

const CATEGORIAS_INGRESO = [
    { id: 1, nombre: 'SUELDO', icono: 'work' },
];

function renderModal(props = {}) {
    return render(
        <IngresoModal
            isOpen={true}
            onClose={() => {}}
            categoriaIngresos={CATEGORIAS_INGRESO}
            onIngresoGuardado={() => {}}
            {...props}
        />
    );
}

/**
 * El wizard deshabilita brevemente (400ms) los botones de navegación al cambiar de
 * paso (ver DURACION_BLOQUEO_PASO_MS en IngresoModal.jsx) para evitar doble-click.
 * Esperamos a que se rehabilite antes de clickear, igual que haría un usuario real.
 */
async function clickCuandoHabilitado(boton) {
    await waitFor(() => expect(boton).not.toBeDisabled());
    fireEvent.click(boton);
}

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-root"></div>';
    vi.clearAllMocks();
    db.getIncomesByMonth.mockResolvedValue([]);
    db.getRecurringIncomes.mockResolvedValue([]);
    db.createIncome.mockResolvedValue({ id: 1 });
});

describe('IngresoModal', () => {
    it('muestra la vista de lista al abrir, con el botón "Nuevo ingreso"', async () => {
        renderModal();
        expect(await screen.findByText('Ingresos')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Nuevo ingreso/i })).toBeInTheDocument();
    });

    it('completa el wizard de 2 pasos y registra un ingreso puntual exitosamente', async () => {
        const onIngresoGuardado = vi.fn().mockResolvedValue();
        renderModal({ onIngresoGuardado });

        fireEvent.click(await screen.findByRole('button', { name: /Nuevo ingreso/i }));

        // Paso 1: monto
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '5000' } });
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));

        // Paso 2: categoría (opcional) y tipo puntual/recurrente
        await screen.findByText('SUELDO');
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Agregar ingreso/i }));

        expect(await screen.findByText('¡Ingreso registrado!')).toBeInTheDocument();
        expect(db.createIncome).toHaveBeenCalledWith(expect.objectContaining({ monto: 5000 }));
        await waitFor(() => expect(onIngresoGuardado).toHaveBeenCalled());
    });

    it('muestra error de validación si el monto es cero y no avanza de paso', async () => {
        renderModal();
        fireEvent.click(await screen.findByRole('button', { name: /Nuevo ingreso/i }));
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));
        expect(await screen.findByText(/El monto debe ser mayor a cero/i)).toBeInTheDocument();
    }, 10000);

    it('muestra fase de resultado con error (vía ResultModal) cuando falla el guardado', async () => {
        db.createIncome.mockRejectedValue(new Error('Error de red'));
        renderModal();

        fireEvent.click(await screen.findByRole('button', { name: /Nuevo ingreso/i }));
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '5000' } });
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));

        await screen.findByText('SUELDO');
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Agregar ingreso/i }));

        expect(await screen.findByText('No se pudo guardar el ingreso')).toBeInTheDocument();
        expect(screen.getByText('Error de red')).toBeInTheDocument();
        // El botón "Continuar" viene de ResultModal (UX-14): confirma que se unificó el popup.
        expect(screen.getByRole('button', { name: /Continuar/i })).toBeInTheDocument();
    });

    it('vuelve a la vista de lista (sin cerrar el modal) al continuar tras un resultado', async () => {
        renderModal();

        fireEvent.click(await screen.findByRole('button', { name: /Nuevo ingreso/i }));
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '5000' } });
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Siguiente/i }));
        await screen.findByText('SUELDO');
        await clickCuandoHabilitado(screen.getByRole('button', { name: /Agregar ingreso/i }));

        fireEvent.click(await screen.findByRole('button', { name: /Continuar/i }));

        expect(await screen.findByRole('button', { name: /Nuevo ingreso/i })).toBeInTheDocument();
    });
});
