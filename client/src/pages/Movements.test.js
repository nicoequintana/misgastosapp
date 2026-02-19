import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Movements from './Movements';
import { BrowserRouter } from 'react-router-dom';

// Mock Fetch
global.fetch = jest.fn();

describe('Movements Component Integration Test', () => {
    beforeEach(() => {
        fetch.mockClear();
    });

    test('Should render movements with Spanish fields correctly', async () => {
        const mockData = {
            recentExpenses: [
                { id: 1, descripcion: "Prueba Spanish", monto: 1234.50, categoria: "Comida", metodo_pago: "Efectivo", es_fijo: false, fecha: new Date().toISOString() }
            ],
            fixedExpenses: []
        };

        fetch.mockResolvedValueOnce({
            json: async () => mockData,
            ok: true
        });

        render(
            <BrowserRouter>
                <Movements />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText("Prueba Spanish")).toBeInTheDocument();
            expect(screen.getByText("-$1.234,50")).toBeInTheDocument(); // Formatting check es-AR/es-ES
        });
    });
});
