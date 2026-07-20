/**
 * Tests para Modal — fix UX-01 (accesibilidad de teclado/foco).
 * Antes: sin role="dialog"/aria-modal, sin cierre con ESC, sin mover el foco
 * al abrir ni devolverlo al cerrar, y sin atrapar el Tab dentro del modal.
 */
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Modal from './Modal';

beforeEach(() => {
    document.body.innerHTML = '<div id="modal-root"></div>';
});

describe('Modal — accesibilidad', () => {
    it('expone role="dialog", aria-modal y aria-labelledby apuntando al título', async () => {
        render(<Modal isOpen={true} onClose={() => {}} title="Nuevo gasto">contenido</Modal>);

        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        expect(document.getElementById(labelledBy)).toHaveTextContent('Nuevo gasto');
    });

    it('cierra con la tecla Escape', async () => {
        const onClose = vi.fn();
        render(<Modal isOpen={true} onClose={onClose} title="Nuevo gasto">contenido</Modal>);
        await screen.findByRole('dialog');

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('NO cierra con Escape cuando disableClose es true', async () => {
        const onClose = vi.fn();
        render(<Modal isOpen={true} onClose={onClose} disableClose title="Guardando...">contenido</Modal>);
        await screen.findByRole('dialog');

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).not.toHaveBeenCalled();
    });

    it('mueve el foco dentro del modal al abrir', async () => {
        render(
            <Modal isOpen={true} onClose={() => {}} title="Nuevo gasto" footer={<button>Guardar</button>}>
                <input placeholder="monto" />
            </Modal>
        );
        const dialog = await screen.findByRole('dialog');

        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    });

    it('devuelve el foco al elemento disparador al cerrar', async () => {
        const Wrapper = () => {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button onClick={() => setOpen(true)}>Abrir</button>
                    <Modal isOpen={open} onClose={() => setOpen(false)} title="Detalle">contenido</Modal>
                </>
            );
        };
        render(<Wrapper />);

        const trigger = screen.getByText('Abrir');
        trigger.focus();
        fireEvent.click(trigger);

        await screen.findByRole('dialog');
        fireEvent.keyDown(document, { key: 'Escape' });

        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('atrapa el Tab: desde el último elemento enfocable, Tab vuelve al primero', async () => {
        render(
            <Modal isOpen={true} onClose={() => {}} title="Nuevo gasto" footer={<button>Guardar</button>}>
                <input data-testid="primero" placeholder="monto" />
                <input data-testid="segundo" placeholder="descripcion" />
            </Modal>
        );
        const dialog = await screen.findByRole('dialog');
        const focusables = dialog.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])');
        const primero = focusables[0];
        const ultimo = focusables[focusables.length - 1];

        ultimo.focus();
        fireEvent.keyDown(dialog, { key: 'Tab' });

        expect(document.activeElement).toBe(primero);
    });

    it('atrapa Shift+Tab: desde el primer elemento, vuelve al último', async () => {
        render(
            <Modal isOpen={true} onClose={() => {}} title="Nuevo gasto" footer={<button>Guardar</button>}>
                <input data-testid="primero" placeholder="monto" />
            </Modal>
        );
        const dialog = await screen.findByRole('dialog');
        const focusables = dialog.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])');
        const primero = focusables[0];
        const ultimo = focusables[focusables.length - 1];

        primero.focus();
        fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });

        expect(document.activeElement).toBe(ultimo);
    });

    it('no rompe cuando no hay footer ni title (sigue renderizando el dialog)', async () => {
        render(<Modal isOpen={true} onClose={() => {}}>solo contenido</Modal>);
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeInTheDocument();
    });
});
