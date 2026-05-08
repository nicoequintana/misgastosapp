import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'tusgastos_tour_done';

const STEPS = [
    {
        icon: 'waving_hand',
        title: '¡Bienvenido a Tus Gastos!',
        description: 'Tu asistente financiero personal. En segundos vas a tener un panorama claro de tus ingresos, gastos y cuánto te queda disponible cada mes.',
    },
    {
        icon: 'dashboard',
        title: 'Dashboard — tu resumen de un vistazo',
        description: 'La pantalla principal muestra tu ingreso mensual, el total gastado (fijos y variables) y tu saldo disponible. También podés cargar o actualizar tu ingreso del mes desde acá.',
    },
    {
        icon: 'add_circle',
        title: 'Registrá tus gastos',
        description: 'Usá el botón "+" para cargar un gasto. Elegí si es fijo (alquiler, servicios, suscripciones) o variable (salidas, supermercado, compras). Asignale una categoría y un método de pago.',
    },
    {
        icon: 'receipt_long',
        title: 'Historial y Reportes',
        description: 'En "Movimientos" encontrás todo lo que registraste con búsqueda y filtros. En "Reportes" analizás tus gastos por período con rankings por categoría para entender en qué gastás más.',
    },
    {
        icon: 'category',
        title: 'Categorías personalizadas',
        description: 'En "Configuración" podés crear tus propias categorías además de las predeterminadas. Así organizás tus gastos exactamente como te resulte más cómodo.',
    },
    {
        icon: 'mail',
        title: 'Notificaciones por mail',
        description: 'Activá alertas automáticas en Configuración: resumen mensual, aviso cuando superás tu presupuesto, y más. Solo activalas y llegan directo a tu casilla.',
        cta: {
            label: 'Ir a Configuración',
            icon: 'settings',
            path: '/configuracion',
        },
    },
];

const WelcomeTour = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState(0);
    const [isClosing, setIsClosing] = useState(false);
    const [stepDir, setStepDir] = useState('next'); // 'next' | 'prev'
    const [animating, setAnimating] = useState(false);
    const navigate = useNavigate();
    const timerRef = useRef(null);

    useEffect(() => {
        if (!localStorage.getItem(STORAGE_KEY)) {
            timerRef.current = setTimeout(() => setIsOpen(true), 800);
        }
        return () => clearTimeout(timerRef.current);
    }, []);

    const close = (redirect = null) => {
        setIsClosing(true);
        setTimeout(() => {
            localStorage.setItem(STORAGE_KEY, '1');
            setIsOpen(false);
            setIsClosing(false);
            if (redirect) navigate(redirect);
        }, 280);
    };

    const goTo = (target) => {
        if (animating || target === step) return;
        setStepDir(target > step ? 'next' : 'prev');
        setAnimating(true);
        setTimeout(() => {
            setStep(target);
            setAnimating(false);
        }, 180);
    };

    const next = () => {
        if (step < STEPS.length - 1) goTo(step + 1);
        else close();
    };

    const prev = () => {
        if (step > 0) goTo(step - 1);
    };

    if (!isOpen) return null;

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;
    const stepClass = animating ? `tour-step-exit-${stepDir}` : 'tour-step-enter';

    return createPortal(
        <div className={`tour-overlay ${isClosing ? 'closing' : ''}`} onClick={() => close()}>
            <div
                className={`tour-card glass-card ${isClosing ? 'closing' : ''}`}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Tour de bienvenida"
            >
                {/* Cerrar */}
                <button className="tour-close" onClick={() => close()} aria-label="Cerrar tour">
                    <span className="material-symbols-outlined">close</span>
                </button>

                {/* Contenido animado por paso */}
                <div className={`tour-step-content ${stepClass}`}>
                    <div className="tour-icon-wrap">
                        <span className="material-symbols-outlined tour-icon">{current.icon}</span>
                    </div>

                    <div className="tour-body">
                        <h3 className="tour-title">{current.title}</h3>
                        <p className="tour-description">{current.description}</p>
                    </div>

                    {/* CTA secundario (ej: ir a Configuración) */}
                    {current.cta && (
                        <button
                            className="tour-btn tour-btn--cta"
                            onClick={() => close(current.cta.path)}
                        >
                            <span className="material-symbols-outlined">{current.cta.icon}</span>
                            {current.cta.label}
                        </button>
                    )}
                </div>

                {/* Dots */}
                <div className="tour-dots" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
                    {STEPS.map((_, i) => (
                        <button
                            key={i}
                            className={`tour-dot ${i === step ? 'active' : ''}`}
                            onClick={() => goTo(i)}
                            aria-label={`Ir al paso ${i + 1}`}
                        />
                    ))}
                </div>

                {/* Navegación */}
                <div className="tour-nav">
                    {step > 0 ? (
                        <button className="tour-btn tour-btn--ghost" onClick={prev}>
                            <span className="material-symbols-outlined">arrow_back</span>
                            Anterior
                        </button>
                    ) : (
                        <button className="tour-btn tour-btn--ghost" onClick={() => close()}>
                            Omitir
                        </button>
                    )}

                    <button className="tour-btn tour-btn--primary" onClick={next}>
                        {isLast ? 'Empezar' : 'Siguiente'}
                        {!isLast && <span className="material-symbols-outlined">arrow_forward</span>}
                        {isLast && <span className="material-symbols-outlined">rocket_launch</span>}
                    </button>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')
    );
};

export default WelcomeTour;
