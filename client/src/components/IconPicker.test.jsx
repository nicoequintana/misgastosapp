import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IconPicker from './IconPicker';

describe('IconPicker', () => {
    it('muestra la lista curada de íconos', () => {
        render(<IconPicker valorSeleccionado="label" onChange={() => {}} />);
        expect(screen.getByLabelText(/shopping_cart/i)).toBeInTheDocument();
    });

    it('filtra íconos por texto de búsqueda', () => {
        render(<IconPicker valorSeleccionado="label" onChange={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText('Buscar ícono...'), { target: { value: 'car' } });
        expect(screen.getByLabelText('directions_car')).toBeInTheDocument();
        expect(screen.queryByLabelText('health_and_safety')).not.toBeInTheDocument();
    });

    it('llama a onChange con el nombre del ícono tocado', () => {
        const onChange = vi.fn();
        render(<IconPicker valorSeleccionado="label" onChange={onChange} />);
        fireEvent.click(screen.getByLabelText('directions_car'));
        expect(onChange).toHaveBeenCalledWith('directions_car');
    });

    it('marca visualmente el ícono seleccionado', () => {
        render(<IconPicker valorSeleccionado="directions_car" onChange={() => {}} />);
        expect(screen.getByLabelText('directions_car')).toHaveClass('icon-picker__icono--activo');
    });
});
