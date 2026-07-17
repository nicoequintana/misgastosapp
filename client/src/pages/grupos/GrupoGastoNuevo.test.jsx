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
});
