import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResultModal from './ResultModal';

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-root"></div>';
});

describe('ResultModal', () => {
    it('muestra título y subtítulo cuando está abierto', () => {
        render(
            <ResultModal isOpen={true} onClose={() => {}} tipo="success" titulo="Gasto registrado" subtitulo="Se guardó correctamente" />
        );
        expect(screen.getByText('Gasto registrado')).toBeInTheDocument();
        expect(screen.getByText('Se guardó correctamente')).toBeInTheDocument();
    });

    it('no renderiza nada cuando isOpen es false', () => {
        render(<ResultModal isOpen={false} onClose={() => {}} tipo="success" titulo="Gasto registrado" />);
        expect(screen.queryByText('Gasto registrado')).not.toBeInTheDocument();
    });

    it('usa el texto de botón default de tipo success', () => {
        render(<ResultModal isOpen={true} onClose={() => {}} tipo="success" titulo="OK" />);
        expect(screen.getByText('Continuar')).toBeInTheDocument();
    });

    it('usa el texto de botón default de tipo error', () => {
        render(<ResultModal isOpen={true} onClose={() => {}} tipo="error" titulo="Error" />);
        expect(screen.getByText('Ok')).toBeInTheDocument();
    });

    it('permite sobreescribir el texto del botón', () => {
        render(<ResultModal isOpen={true} onClose={() => {}} tipo="success" titulo="OK" textoBoton="Entendido" />);
        expect(screen.getByText('Entendido')).toBeInTheDocument();
    });

    it('llama a onClose al tocar el botón', () => {
        const onClose = vi.fn();
        render(<ResultModal isOpen={true} onClose={onClose} tipo="success" titulo="OK" />);
        fireEvent.click(screen.getByText('Continuar'));
        expect(onClose).toHaveBeenCalled();
    });
});
