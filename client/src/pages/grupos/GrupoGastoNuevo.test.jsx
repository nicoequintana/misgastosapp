import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GrupoGastoNuevo from './GrupoGastoNuevo';
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

function renderPagina() {
    return render(
        <AuthContext.Provider value={{ user: { id: 'u1' } }}>
            <MemoryRouter initialEntries={['/grupos/1/gastos/nuevo']}>
                <Routes>
                    <Route path="/grupos/:id/gastos/nuevo" element={<GrupoGastoNuevo />} />
                </Routes>
            </MemoryRouter>
        </AuthContext.Provider>
    );
}

describe('GrupoGastoNuevo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.obtenerMiembrosDelGrupo.mockResolvedValue(MIEMBROS);
        db.getCategories.mockResolvedValue(CATEGORIAS);
        db.getPaymentMethods.mockResolvedValue(METODOS_PAGO);
        db.crearGastoGrupal.mockResolvedValue({ gasto: { id: 1 }, participantes: [] });
        db.crearGastoGrupalEnCuotas.mockResolvedValue({ gasto: { id: 1 }, gastos: [], participantes: [] });
    });

    it('muestra chips de categoría y método de pago en vez de selects nativos', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('COMIDA')).toBeInTheDocument());
        expect(screen.getByText('EFECTIVO')).toBeInTheDocument();
        expect(screen.getByText('VISA')).toBeInTheDocument();
        expect(screen.queryByLabelText(/Categoría/i)?.tagName).not.toBe('SELECT');
    });

    it('al elegir un método que acepta cuotas, muestra selector de cuotas y mes de primera cuota', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('VISA')).toBeInTheDocument());
        fireEvent.click(screen.getByText('VISA'));
        expect(await screen.findByLabelText(/Cuotas/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/primera cuota/i)).toBeInTheDocument();
    });

    it('al elegir un método que NO acepta cuotas, no muestra selector de cuotas', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('EFECTIVO')).toBeInTheDocument());
        fireEvent.click(screen.getByText('EFECTIVO'));
        expect(screen.queryByLabelText(/Cuotas/i)).not.toBeInTheDocument();
    });

    it('muestra fase "guardando" al enviar el formulario y fase "resultado" al terminar', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('COMIDA')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText(/Descripción/i), { target: { value: 'Cena' } });
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        fireEvent.click(screen.getByText('COMIDA'));
        fireEvent.click(screen.getByText('EFECTIVO'));
        fireEvent.change(screen.getByLabelText(/Pagó/i), { target: { value: 'u1' } });

        fireEvent.click(screen.getByRole('button', { name: /Guardar gasto/i }));

        expect(await screen.findByText(/¡Gasto registrado!|Gasto registrado/i)).toBeInTheDocument();
        expect(db.crearGastoGrupal).toHaveBeenCalledWith(expect.objectContaining({ idMetodoPago: 10 }));
    });

    it('bloquea el submit y muestra error si no se eligió método de pago', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('COMIDA')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText(/Descripción/i), { target: { value: 'Cena' } });
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        fireEvent.change(screen.getByLabelText(/Pagó/i), { target: { value: 'u1' } });

        fireEvent.click(screen.getByRole('button', { name: /Guardar gasto/i }));

        expect(await screen.findByText(/Seleccioná un método de pago/i)).toBeInTheDocument();
        expect(db.crearGastoGrupal).not.toHaveBeenCalled();
    });

    it('muestra error inline al perder foco de descripción vacía (on-blur)', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('COMIDA')).toBeInTheDocument());

        const inputDescripcion = screen.getByLabelText(/Descripción/i);
        fireEvent.blur(inputDescripcion);

        expect(await screen.findByText(/La descripción es obligatoria/i)).toBeInTheDocument();

        fireEvent.change(inputDescripcion, { target: { value: 'Cena' } });
        expect(screen.queryByText(/La descripción es obligatoria/i)).not.toBeInTheDocument();
    });

    it('muestra error inline al perder foco del monto en cero (on-blur)', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('COMIDA')).toBeInTheDocument());

        const inputMonto = screen.getByLabelText(/Monto/i);
        fireEvent.blur(inputMonto);

        expect(await screen.findByText(/El monto debe ser mayor a cero/i)).toBeInTheDocument();

        fireEvent.change(inputMonto, { target: { value: '1000' } });
        expect(screen.queryByText(/El monto debe ser mayor a cero/i)).not.toBeInTheDocument();
    });

    it('muestra error inline al perder foco de fecha vacía (on-blur)', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('COMIDA')).toBeInTheDocument());

        const inputFecha = screen.getByLabelText(/Fecha/i);
        fireEvent.change(inputFecha, { target: { value: '' } });
        fireEvent.blur(inputFecha);

        expect(await screen.findByText(/La fecha es obligatoria/i)).toBeInTheDocument();

        fireEvent.change(inputFecha, { target: { value: '2026-07-21' } });
        expect(screen.queryByText(/La fecha es obligatoria/i)).not.toBeInTheDocument();
    });

    it('muestra error inline al perder foco de "Pagó" sin seleccionar (on-blur)', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('COMIDA')).toBeInTheDocument());

        // El pagador arranca precargado con el usuario actual (default del hook) — se
        // vacía primero para poder probar el caso "sin seleccionar" antes de perder foco.
        const selectPagadoPor = screen.getByLabelText(/Pagó/i);
        fireEvent.change(selectPagadoPor, { target: { value: '' } });
        fireEvent.blur(selectPagadoPor);

        expect(await screen.findByText('Seleccioná quién pagó.')).toBeInTheDocument();

        fireEvent.change(selectPagadoPor, { target: { value: 'u1' } });
        expect(screen.queryByText('Seleccioná quién pagó.')).not.toBeInTheDocument();
    });

    it('muestra error inline al perder foco de primera cuota sin completar (on-blur, método con cuotas)', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('VISA')).toBeInTheDocument());
        fireEvent.click(screen.getByText('VISA'));

        const inputPrimeraCuota = await screen.findByLabelText(/primera cuota/i);
        fireEvent.blur(inputPrimeraCuota);

        expect(await screen.findByText(/Indicá en qué mes vence la primera cuota/i)).toBeInTheDocument();

        fireEvent.change(inputPrimeraCuota, { target: { value: '2026-08' } });
        expect(screen.queryByText(/Indicá en qué mes vence la primera cuota/i)).not.toBeInTheDocument();
    });

    it('muestra fase de resultado con error y vuelve al formulario al continuar', async () => {
        db.crearGastoGrupal.mockRejectedValue(new Error('Error de red'));
        renderPagina();
        await waitFor(() => expect(screen.getByText('COMIDA')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText(/Descripción/i), { target: { value: 'Cena' } });
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        fireEvent.click(screen.getByText('COMIDA'));
        fireEvent.click(screen.getByText('EFECTIVO'));
        fireEvent.change(screen.getByLabelText(/Pagó/i), { target: { value: 'u1' } });

        fireEvent.click(screen.getByRole('button', { name: /Guardar gasto/i }));

        expect(await screen.findByText(/No se pudo registrar el gasto/i)).toBeInTheDocument();
        expect(screen.getByText('Error de red')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
        expect(await screen.findByLabelText(/Descripción/i)).toBeInTheDocument();
    });
});
