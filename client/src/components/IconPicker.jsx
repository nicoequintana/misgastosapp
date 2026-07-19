import React from 'react';

// Lista curada de Material Symbols para categorías y métodos de pago.
// Se mantiene acotada (no la librería completa) para consistencia visual y peso de bundle.
const ICONOS_CURADOS = [
    'shopping_cart', 'directions_car', 'health_and_safety', 'sports_esports',
    'home', 'checkroom', 'medication', 'local_gas_station', 'restaurant',
    'local_cafe', 'flight', 'school', 'pets', 'fitness_center', 'movie',
    'devices', 'phone_iphone', 'wifi', 'lightbulb', 'water_drop',
    'local_grocery_store', 'card_giftcard', 'celebration', 'child_care',
    'spa', 'local_hospital', 'directions_bus', 'local_taxi', 'apartment',
    'receipt_long', 'account_balance', 'savings', 'handshake', 'payments',
    'credit_card', 'account_balance_wallet', 'attach_money', 'label',
];

/**
 * Grid de selección de ícono.
 *
 * @param {string} valorSeleccionado - nombre del ícono actualmente elegido
 * @param {(icono: string) => void} onChange
 */
const IconPicker = ({ valorSeleccionado, onChange }) => {
    return (
        <div className="icon-picker">
            <div className="icon-picker__grid">
                {ICONOS_CURADOS.map(nombre => (
                    <button
                        key={nombre}
                        type="button"
                        aria-label={nombre}
                        className={`icon-picker__icono${valorSeleccionado === nombre ? ' icon-picker__icono--activo' : ''}`}
                        onClick={() => onChange(nombre)}
                        title={nombre}
                    >
                        <span className="material-symbols-outlined">{nombre}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default IconPicker;
