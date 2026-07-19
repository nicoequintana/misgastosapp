import { useState, useEffect } from 'react';
import Modal from './Modal';

// Versionado: cambiar el sufijo (_v2, _v3...) para volver a mostrar el aviso
// ante una futura tanda de novedades, sin afectar a quienes ya vieron esta.
const STORAGE_KEY = 'tusgastos_novedad_v1';
// Mismo storage key que WelcomeTour.jsx — un usuario 100% nuevo ya recibe el
// mensaje de "todo es simple" en el tour; este aviso es solo para quienes
// YA usaban la app y no van a ver el tour de nuevo.
const TOUR_STORAGE_KEY = 'tusgastos_tour_done';

const MEJORAS_FUTURAS = [
    'Buscador rápido de gastos y movimientos.',
    'Recordatorios inteligentes para gastos fijos recurrentes.',
    'Exportar tus reportes a PDF o Excel.',
];

/**
 * Aviso de novedades — se muestra una sola vez por navegador (localStorage),
 * a diferencia de WelcomeTour que es solo para el onboarding de usuarios nuevos.
 * Independiente del tour: un usuario que ya usa la app y nunca ve el tour de
 * nuevo, sí debe ver este aviso al menos una vez.
 */
const NoveltyModal = () => {
    const [isOpen, setIsOpen] = useState(false);

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        const yaVioNovedad = localStorage.getItem(STORAGE_KEY);
        const esUsuarioNuevo = !localStorage.getItem(TOUR_STORAGE_KEY);
        if (!yaVioNovedad && !esUsuarioNuevo) {
            setIsOpen(true);
        }
    }, []);
    /* eslint-enable react-hooks/set-state-in-effect */

    const cerrar = () => {
        localStorage.setItem(STORAGE_KEY, '1');
        setIsOpen(false);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={cerrar}
            title="¡Cargar tus gastos ahora es más rápido!"
            subtitle="Novedades en Tus Gastos"
            footer={
                <button className="btn btn-primary" onClick={cerrar} style={{ width: '100%' }}>
                    Entendido
                </button>
            }
        >
            <p style={{ color: 'var(--text-main)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
                Simplificamos la carga de gastos e ingresos, tanto personales como en tus
                grupos compartidos. Ahora es más simple y directo: menos pasos, menos fricción.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                Próximamente
            </p>
            <ul style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.8, paddingLeft: 'var(--space-5)' }}>
                {MEJORAS_FUTURAS.map(mejora => (
                    <li key={mejora}>{mejora}</li>
                ))}
            </ul>
        </Modal>
    );
};

export default NoveltyModal;
