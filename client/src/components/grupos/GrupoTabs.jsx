import React from 'react';

/**
 * Switcher de tabs con estilo glassmorphism para GrupoDetalle.
 * Gestiona la navegación entre Resumen / Gastos / Miembros / Saldos.
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string}>} props.tabs - Lista de tabs a renderizar
 * @param {string} props.activeTab - ID del tab activo
 * @param {Function} props.onTabChange - Callback al cambiar tab: onTabChange(tabId)
 */
const GrupoTabs = ({ tabs, activeTab, onTabChange }) => {
    return (
        <div className="grupo-tabs" role="tablist">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    className={`grupo-tabs__tab ${activeTab === tab.id ? 'grupo-tabs__tab--activo' : ''}`}
                    onClick={() => onTabChange(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
};

export default GrupoTabs;
