import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GrupoGastoEditar from './GrupoGastoEditar';
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
const GASTO_EXISTENTE = {
    id: 5,
    descripcion: 'CENA',
    monto: 1000,
    fecha: '2026-07-01T12:00:00-03:00',
    id_categoria: 1,
    id_metodo_pago: 10,
    pagado_por: 'u1',
    nota: '',
    cuotas: 1,
    participantes: [{ user_id: 'u1' }, { user_id: 'u2' }],
};

function renderPagina() {
    return render(
        <AuthContext.Provider value={{ user: { id: 'u1' } }}>
            <MemoryRouter initialEntries={['/grupos/1/gastos/5/editar']}>
                <Routes>
                    <Route path="/grupos/:id/gastos/:gastoId/editar" element={<GrupoGastoEditar />} />
                </Routes>
            </MemoryRouter>
        </AuthContext.Provider>
    );
}

// Espera a que el formulario termine de precargarse: el chip de método de pago
// activo aparece y el input de monto (CurrencyInput) ya refleja el valor cargado.
// Es necesario esperar ambos porque CurrencyInput sincroniza su displayValue desde
// la prop `value` en un efecto separado, que puede correr un tick después del
// render donde ya se ve el chip activo.
async function esperarFormularioPrecargado() {
    await waitFor(() => expect(screen.getByText('EFECTIVO')).toBeInTheDocument());
    await waitFor(() => expect(document.getElementById('monto').value).not.toBe(''));
}

describe('GrupoGastoEditar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.obtenerMiembrosDelGrupo.mockResolvedValue(MIEMBROS);
        db.getCategories.mockResolvedValue(CATEGORIAS);
        db.getPaymentMethods.mockResolvedValue(METODOS_PAGO);
        db.obtenerGastoConParticipantes.mockResolvedValue(GASTO_EXISTENTE);
        db.actualizarGastoGrupal.mockResolvedValue({ gasto: { id: 5 }, participantes: [] });
    });

    it('precarga el chip de método de pago activo desde el gasto existente', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('EFECTIVO')).toBeInTheDocument());
        const chipEfectivo = screen.getByText('EFECTIVO').closest('button');
        expect(chipEfectivo.className).toContain('chip-selector__chip--activo');
    });

    it('al cambiar a un método que acepta cuotas, muestra selector de cuotas', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('VISA')).toBeInTheDocument());
        fireEvent.click(screen.getByText('VISA'));
        expect(await screen.findByLabelText(/Cuotas/i)).toBeInTheDocument();
    });

    it('envía idMetodoPago al guardar cambios', async () => {
        renderPagina();
        await esperarFormularioPrecargado();
        fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
        await waitFor(() => expect(db.actualizarGastoGrupal).toHaveBeenCalled());
        expect(db.actualizarGastoGrupal).toHaveBeenCalledWith(
            '5',
            expect.objectContaining({ idMetodoPago: 10 })
        );
    });

    it('muestra fase de resultado tras guardar exitosamente', async () => {
        renderPagina();
        await esperarFormularioPrecargado();
        fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
        expect(await screen.findByText(/actualizado/i)).toBeInTheDocument();
    });
});
