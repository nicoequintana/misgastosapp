import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import GrupoCard from '../../components/grupos/GrupoCard';
import * as db from '../../lib/db';

/**
 * Página de listado de grupos del usuario actual.
 * Carga los grupos al montar, muestra empty state si no hay ninguno
 * y navega a /grupos/:id al hacer click en una card.
 */
const Grupos = () => {
    const navigate = useNavigate();

    const [grupos, setGrupos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    // Carga los grupos del usuario al montar el componente
    const cargarGrupos = useCallback(async () => {
        try {
            setCargando(true);
            setError(null);
            const data = await db.obtenerGruposDelUsuario();
            setGrupos(data || []);
        } catch (err) {
            console.error('Error al cargar grupos:', err);
            setError('No se pudieron cargar los grupos. Intentá recargar la página.');
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        cargarGrupos();
    }, [cargarGrupos]);

    // Navega al detalle del grupo seleccionado
    const handleClickGrupo = (grupoId) => {
        navigate(`/grupos/${grupoId}`);
    };

    // Navega al formulario de nuevo grupo
    const handleNuevoGrupo = () => {
        navigate('/grupos/nuevo');
    };

    // ── Estado de carga ──
    if (cargando) {
        return (
            <div className="grupos-page">
                <div className="grupos-page__header">
                    <h1 className="grupos-page__titulo">Grupos</h1>
                </div>
                <div className="grupos-page__loading">
                    <div className="loading-spinner" />
                    <p>Cargando grupos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="grupos-page">
            {/* Encabezado con título y botón solo cuando ya hay grupos */}
            <div className="grupos-page__header">
                <h1 className="grupos-page__titulo">Grupos</h1>
                {grupos.length > 0 && (
                    <button
                        className="btn btn-primary"
                        onClick={handleNuevoGrupo}
                    >
                        <span className="material-symbols-outlined">group_add</span>
                        Nuevo grupo
                    </button>
                )}
            </div>

            {/* Banner de error */}
            {error && (
                <div className="grupos-page__error">
                    <span className="material-symbols-outlined">error_outline</span>
                    {error}
                </div>
            )}

            {/* Lista de grupos o empty state */}
            {!error && grupos.length === 0 ? (
                <div className="grupos-page__empty">
                    <div className="glass-card grupos-page__empty-card">
                        <span className="material-symbols-outlined grupos-page__empty-icon">group</span>
                        <h2 className="grupos-page__empty-titulo">Todavía no tenés grupos</h2>
                        <p className="grupos-page__empty-desc">
                            Creá un grupo para compartir gastos con amigos, familia o compañeros.
                        </p>
                        <button
                            className="btn btn-primary"
                            onClick={handleNuevoGrupo}
                        >
                            <span className="material-symbols-outlined">group_add</span>
                            Crear grupo
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grupos-page__lista">
                    {grupos.map((grupo) => (
                        <GrupoCard
                            key={grupo.id}
                            grupo={grupo}
                            saldoNeto={null}
                            onClick={handleClickGrupo}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default Grupos;
