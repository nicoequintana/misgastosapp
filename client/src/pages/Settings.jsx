import React, { useState, useEffect, useCallback } from 'react';
import GlassCard from '../components/GlassCard';
import * as db from '../lib/db';

/**
 * Página de Configuración.
 * Permite gestionar las categorías de gastos y los métodos de pago.
 * 
 * Funcionalidades:
 * - Listar categorías y métodos activos.
 * - Agregar nuevos registros.
 * - Editar nombres de registros existentes.
 * - Desactivar (soft delete) registros.
 */
const Settings = () => {
    // Estado para almacenamiento de datos
    const [categorias, setCategorias] = useState([]);
    const [metodosPago, setMetodosPago] = useState([]);

    // Estado para inputs de creación
    const [nuevaCategoria, setNuevaCategoria] = useState('');
    const [nuevoMetodo, setNuevoMetodo] = useState('');

    // Estado de interfaz
    const [cargando, setCargando] = useState(false);

    // Estado para edición en línea (inline editing)
    const [idEditando, setIdEditando] = useState(null);
    const [tipoEditando, setTipoEditando] = useState(null); // 'categoria' | 'metodo'
    const [valorEdicion, setValorEdicion] = useState('');

    /**
     * Carga los datos iniciales de la base de datos.
     * Utiliza Promise.all para realizar ambas peticiones en paralelo.
     */
    const cargarDatos = useCallback(async () => {
        try {
            const [cats, metodos] = await Promise.all([
                db.getCategories(),
                db.getPaymentMethods()
            ]);
            setCategorias(cats);
            setMetodosPago(metodos);
        } catch (err) {
            console.error("❌ Error al cargar configuración:", err);
        }
    }, []);

    // Efecto inicial de carga
    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    /**
     * Maneja la creación de una nueva categoría.
     * Ordena la lista alfabéticamente tras la inserción.
     */
    const handleAgregarCategoria = async (e) => {
        e.preventDefault();
        if (!nuevaCategoria.trim()) return;

        setCargando(true);
        try {
            const data = await db.createCategory(nuevaCategoria.trim());
            // Actualización optimista o refresco local
            setCategorias(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setNuevaCategoria('');
            console.log('✅ Categoría creada correctamente');
        } catch (err) {
            console.error("❌ Error al agregar categoría:", err);
            alert('Error al agregar la categoría. Por favor, intentá de nuevo.');
        } finally {
            setCargando(false);
        }
    };

    /**
     * Maneja la creación de un nuevo método de pago.
     */
    const handleAgregarMetodo = async (e) => {
        e.preventDefault();
        if (!nuevoMetodo.trim()) return;

        setCargando(true);
        try {
            const data = await db.createPaymentMethod(nuevoMetodo.trim());
            setMetodosPago(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setNuevoMetodo('');
            console.log('✅ Método de pago creado correctamente');
        } catch (err) {
            console.error("❌ Error al agregar método de pago:", err);
            alert('Error al agregar el método de pago. Por favor, intentá de nuevo.');
        } finally {
            setCargando(false);
        }
    };

    /**
     * Inicia el modo de edición para un elemento.
     * 
     * @param {string} id - ID del elemento
     * @param {string} tipo - 'categoria' o 'metodo'
     * @param {string} valorActual - Nombre actual para prellenar el input
     */
    const handleIniciarEdicion = (id, tipo, valorActual) => {
        setIdEditando(id);
        setTipoEditando(tipo);
        setValorEdicion(valorActual);
    };

    /**
     * Cancela el modo edición y limpia el estado.
     */
    const cancelarEdicion = () => {
        setIdEditando(null);
        setTipoEditando(null);
        setValorEdicion('');
    };

    /**
     * Guarda los cambios del elemento en edición.
     */
    const handleGuardarEdicion = async () => {
        if (!valorEdicion.trim()) return;

        setCargando(true);
        try {
            if (tipoEditando === 'categoria') {
                await db.updateCategory(idEditando, valorEdicion.trim());
                console.log('✅ Categoría actualizada correctamente');
            } else {
                await db.updatePaymentMethod(idEditando, valorEdicion.trim());
                console.log('✅ Método de pago actualizado correctamente');
            }
            await cargarDatos(); // Recargar para asegurar consistencia
            cancelarEdicion();
        } catch (err) {
            console.error("❌ Error al actualizar:", err);
            alert('Error al actualizar. Por favor, intentá de nuevo.');
        } finally {
            setCargando(false);
        }
    };

    /**
     * Maneja la desactivación (borrado lógico) de un elemento.
     * Solicita confirmación antes de proceder.
     */
    const handleEliminar = async (id, tipo) => {
        const mensaje = tipo === 'categoria'
            ? '¿Estás seguro de que deseás desactivar esta categoría?'
            : '¿Estás seguro de que deseás desactivar este método de pago?';

        if (!window.confirm(mensaje)) return;

        setCargando(true);
        try {
            if (tipo === 'categoria') {
                await db.deleteCategory(id);
                console.log('✅ Categoría desactivada correctamente');
            } else {
                await db.deletePaymentMethod(id);
                console.log('✅ Método de pago desactivado correctamente');
            }
            await cargarDatos();
        } catch (err) {
            console.error("❌ Error al desactivar:", err);
            alert('Error al desactivar. Por favor, intentá de nuevo.');
        } finally {
            setCargando(false);
        }
    };

    return (
        <div className="settings-page">
            <div className="settings-header">
                <h1 className="settings-title">Configuración</h1>
                <p className="settings-subtitle">Gestioná tus categorías y métodos de pago</p>
            </div>

            <div className="settings-grid">
                {/* ========== SECCIÓN CATEGORÍAS ========== */}
                <GlassCard>
                    <div className="settings-card-header">
                        <h2 className="settings-card-title">Categorías</h2>
                        <p className="settings-card-subtitle">Organizá tus gastos por categorías</p>
                    </div>

                    <form onSubmit={handleAgregarCategoria} className="settings-form">
                        <div className="settings-input-group">
                            <input
                                type="text"
                                value={nuevaCategoria}
                                onChange={(e) => setNuevaCategoria(e.target.value)}
                                placeholder="Nueva categoría..."
                                className="input"
                                style={{ flex: 1 }}
                                disabled={cargando}
                            />
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={cargando || !nuevaCategoria.trim()}
                                style={{ width: '44px', padding: 0, justifyContent: 'center' }}
                            >
                                <span className="material-symbols-outlined">add</span>
                            </button>
                        </div>
                    </form>

                    <div className="settings-list">
                        {categorias.length === 0 ? (
                            <div className="empty-state">No hay categorías. Agregá una nueva.</div>
                        ) : (
                            categorias.map((cat) => (
                                <div key={cat.id} className="settings-item">
                                    {idEditando === cat.id && tipoEditando === 'categoria' ? (
                                        <>
                                            <input
                                                type="text"
                                                value={valorEdicion}
                                                onChange={(e) => setValorEdicion(e.target.value)}
                                                className="input"
                                                style={{ flex: 1, marginRight: '8px', padding: '8px' }}
                                                autoFocus
                                            />
                                            <div className="settings-actions">
                                                <button onClick={handleGuardarEdicion} className="btn-icon-action save" title="Guardar">
                                                    <span className="material-symbols-outlined">check</span>
                                                </button>
                                                <button onClick={cancelarEdicion} className="btn-icon-action cancel" title="Cancelar">
                                                    <span className="material-symbols-outlined">close</span>
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="settings-item-text">{cat.nombre}</span>
                                            <div className="settings-actions">
                                                <button onClick={() => handleIniciarEdicion(cat.id, 'categoria', cat.nombre)} className="btn-icon-action edit" title="Editar">
                                                    <span className="material-symbols-outlined">edit</span>
                                                </button>
                                                <button onClick={() => handleEliminar(cat.id, 'categoria')} className="btn-icon-action delete" title="Eliminar">
                                                    <span className="material-symbols-outlined">delete</span>
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </GlassCard>

                {/* ========== SECCIÓN MÉTODOS DE PAGO ========== */}
                <GlassCard>
                    <div className="settings-card-header">
                        <h2 className="settings-card-title">Métodos de Pago</h2>
                        <p className="settings-card-subtitle">Administrá tus formas de pago</p>
                    </div>

                    <form onSubmit={handleAgregarMetodo} className="settings-form">
                        <div className="settings-input-group">
                            <input
                                type="text"
                                value={nuevoMetodo}
                                onChange={(e) => setNuevoMetodo(e.target.value)}
                                placeholder="Nuevo método de pago..."
                                className="input"
                                style={{ flex: 1 }}
                                disabled={cargando}
                            />
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={cargando || !nuevoMetodo.trim()}
                                style={{ width: '44px', padding: 0, justifyContent: 'center' }}
                            >
                                <span className="material-symbols-outlined">add</span>
                            </button>
                        </div>
                    </form>

                    <div className="settings-list">
                        {metodosPago.length === 0 ? (
                            <div className="empty-state">No hay métodos de pago. Agregá uno nuevo.</div>
                        ) : (
                            metodosPago.map((pm) => (
                                <div key={pm.id} className="settings-item">
                                    {idEditando === pm.id && tipoEditando === 'metodo' ? (
                                        <>
                                            <input
                                                type="text"
                                                value={valorEdicion}
                                                onChange={(e) => setValorEdicion(e.target.value)}
                                                className="input"
                                                style={{ flex: 1, marginRight: '8px', padding: '8px' }}
                                                autoFocus
                                            />
                                            <div className="settings-actions">
                                                <button onClick={handleGuardarEdicion} className="btn-icon-action save" title="Guardar">
                                                    <span className="material-symbols-outlined">check</span>
                                                </button>
                                                <button onClick={cancelarEdicion} className="btn-icon-action cancel" title="Cancelar">
                                                    <span className="material-symbols-outlined">close</span>
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="settings-item-text">{pm.nombre}</span>
                                            <div className="settings-actions">
                                                <button onClick={() => handleIniciarEdicion(pm.id, 'metodo', pm.nombre)} className="btn-icon-action edit" title="Editar">
                                                    <span className="material-symbols-outlined">edit</span>
                                                </button>
                                                <button onClick={() => handleEliminar(pm.id, 'metodo')} className="btn-icon-action delete" title="Eliminar">
                                                    <span className="material-symbols-outlined">delete</span>
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </GlassCard>
            </div>
        </div>
    );
};

export default Settings;
