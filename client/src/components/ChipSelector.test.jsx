import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChipSelector from './ChipSelector';

const OPCIONES = [
    { id: 1, nombre: 'Supermercado', icono: 'shopping_cart' },
    { id: 2, nombre: 'Transporte', icono: 'directions_car' },
    { id: 3, nombre: 'Salud', icono: 'health_and_safety' },
    { id: 4, nombre: 'Ocio', icono: 'sports_esports' },
    { id: 5, nombre: 'Hogar', icono: 'home' },
    { id: 6, nombre: 'Ropa', icono: 'checkroom' },
    { id: 7, nombre: 'Farmacia', icono: 'medication' },
    { id: 8, nombre: 'Nafta', icono: 'local_gas_station' },
];

describe('ChipSelector', () => {
    it('muestra solo las primeras `limiteVisible` opciones y un chip "Ver más"', () => {
        render(<ChipSelector opciones={OPCIONES} valorSeleccionado={null} onChange={() => {}} limiteVisible={6} />);
        expect(screen.getByText('Supermercado')).toBeInTheDocument();
        expect(screen.getByText('Ropa')).toBeInTheDocument();
        expect(screen.queryByText('Farmacia')).not.toBeInTheDocument();
        expect(screen.getByText('Ver más')).toBeInTheDocument();
    });

    it('despliega el resto de opciones al tocar "Ver más"', () => {
        render(<ChipSelector opciones={OPCIONES} valorSeleccionado={null} onChange={() => {}} limiteVisible={6} />);
        fireEvent.click(screen.getByText('Ver más'));
        expect(screen.getByText('Farmacia')).toBeInTheDocument();
        expect(screen.getByText('Nafta')).toBeInTheDocument();
    });

    it('colapsa de nuevo al tocar "Ver menos"', () => {
        render(<ChipSelector opciones={OPCIONES} valorSeleccionado={null} onChange={() => {}} limiteVisible={6} />);
        fireEvent.click(screen.getByText('Ver más'));
        expect(screen.getByText('Farmacia')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Ver menos'));
        expect(screen.queryByText('Farmacia')).not.toBeInTheDocument();
        expect(screen.getByText('Ver más')).toBeInTheDocument();
    });

    it('llama a onChange con el id de la opción tocada', () => {
        const onChange = vi.fn();
        render(<ChipSelector opciones={OPCIONES} valorSeleccionado={null} onChange={onChange} limiteVisible={6} />);
        fireEvent.click(screen.getByText('Transporte'));
        expect(onChange).toHaveBeenCalledWith(2);
    });

    it('marca visualmente el chip seleccionado', () => {
        render(<ChipSelector opciones={OPCIONES} valorSeleccionado={2} onChange={() => {}} limiteVisible={6} />);
        expect(screen.getByRole('button', { name: /Transporte/ })).toHaveClass('chip-selector__chip--activo');
    });

    it('no muestra el chip "Ver más" si hay menos opciones que el límite', () => {
        render(<ChipSelector opciones={OPCIONES.slice(0, 2)} valorSeleccionado={null} onChange={() => {}} limiteVisible={6} />);
        expect(screen.queryByText('Ver más')).not.toBeInTheDocument();
    });
});
