import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as db from '../../lib/db';

// Límite de caracteres para el nombre del grupo (validado también en db.js)
const MAX_NOMBRE = 120;

/**
 * Formulario para crear un nuevo grupo de gastos compartidos.
 * Valida nombre no vacío y <= MAX_NOMBRE chars, luego llama crearGrupo
 * y redirige a /grupos/:id al completar.
 */
const GrupoNuevo = () => {
    const navigate = useNavigate();

    const [nombre, setNombre] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const [errNombre, setErrNombre] = useState('');

    // Validación client-side del nombre
    const validarNombre = (valor) => {
        if (!valor.trim()) {
            return 'El nombre del grupo no puede estar vacío.';
        }
        if (valor.trim().length > MAX_NOMBRE) {
            return `El nombre no puede superar los ${MAX_NOMBRE} caracteres.`;
        }
        return '';
    };

    const handleNombreChange = (e) => {
        const val = e.target.value;
        setNombre(val);
        // Limpiar error al escribir
        if (errNombre) setErrNombre('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validar antes de enviar
        const errorNombre = validarNombre(nombre);
        if (errorNombre) {
            setErrNombre(errorNombre);
            return;
        }

        try {
            setEnviando(true);
            setError(null);

            const grupo = await db.crearGrupo({
                nombre: nombre.trim(),
                descripcion: descripcion.trim() || undefined,
            });

            // Redirigir al detalle del grupo recién creado
            navigate(`/grupos/${grupo.id}`);
        } catch (err) {
            console.error('Error al crear el grupo:', err);
            setError(err.message || 'Ocurrió un error al crear el grupo. Intentá de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    const handleVolver = () => {
        navigate('/grupos');
    };

    return (
        <div className="grupos-page">
            {/* Encabezado con botón volver */}
            <div className="grupos-page__header">
                <button
                    className="btn btn-ghost grupos-page__volver"
                    onClick={handleVolver}
                    disabled={enviando}
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                    Volver
                </button>
                <h1 className="grupos-page__titulo">Nuevo grupo</h1>
            </div>

            {/* Formulario */}
            <div className="grupos-page__form-wrap">
                <div className="glass-card">
                    <form onSubmit={handleSubmit} noValidate>
                        {/* Campo: Nombre */}
                        <div className="form-group">
                            <label htmlFor="grupo-nombre" className="form-label">
                                Nombre <span className="form-label--req">*</span>
                            </label>
                            <input
                                id="grupo-nombre"
                                type="text"
                                className={`form-input ${errNombre ? 'form-input--error' : ''}`}
                                value={nombre}
                                onChange={handleNombreChange}
                                placeholder="Ej: Viaje a Bariloche"
                                maxLength={MAX_NOMBRE}
                                disabled={enviando}
                                autoFocus
                                aria-describedby={errNombre ? 'grupo-nombre-error' : undefined}
                                aria-invalid={!!errNombre}
                            />
                            {/* Contador de caracteres y error */}
                            <div className="form-input__footer">
                                {errNombre && (
                                    <span className="form-error" id="grupo-nombre-error" role="alert">{errNombre}</span>
                                )}
                                <span className="form-char-count">
                                    {nombre.length}/{MAX_NOMBRE}
                                </span>
                            </div>
                        </div>

                        {/* Campo: Descripción */}
                        <div className="form-group">
                            <label htmlFor="grupo-descripcion" className="form-label">
                                Descripción <span className="form-label--opt">(opcional)</span>
                            </label>
                            <textarea
                                id="grupo-descripcion"
                                className="form-input form-textarea"
                                value={descripcion}
                                onChange={(e) => setDescripcion(e.target.value)}
                                placeholder="Contá de qué trata el grupo..."
                                rows={3}
                                disabled={enviando}
                            />
                        </div>

                        {/* Error general */}
                        {error && (
                            <div className="form-banner-error">
                                <span className="material-symbols-outlined">error_outline</span>
                                {error}
                            </div>
                        )}

                        {/* Acciones */}
                        <div className="form-actions">
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={handleVolver}
                                disabled={enviando}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={enviando}
                            >
                                {enviando ? (
                                    <>
                                        <span className="loading-spinner loading-spinner--sm" />
                                        Creando...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">group_add</span>
                                        Crear grupo
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default GrupoNuevo;
