import { useState, useEffect, useCallback } from 'react';

/**
 * Estado y lógica compartida para gestionar un catálogo del usuario que mezcla
 * ítems globales (de todos) y propios (solo del usuario) — usado en
 * Configuracion.jsx para categorías y métodos de pago, que comparten el mismo
 * patrón de fetch/crear/eliminar y el mismo manejo de la FK constraint 23503
 * cuando el ítem tiene gastos asociados.
 *
 * @param {object} args
 * @param {() => Promise<any[]>} args.fetchItems - trae todos los ítems (globales + propios)
 * @param {(item: any) => Promise<any>} args.crearItem - crea un ítem nuevo
 * @param {(id: any) => Promise<void>} args.eliminarItem - elimina un ítem propio
 * @param {(item: any) => string} args.getNombre - devuelve el nombre del ítem (para orden y duplicados)
 * @param {string} args.nombreEntidad - usado en mensajes de error (ej. "la categoría")
 */
export const useGestionCatalogo = ({ fetchItems, crearItem, eliminarItem, getNombre, nombreEntidad }) => {
    const [items, setItems] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [eliminandoId, setEliminandoId] = useState(null);
    const [confirmEliminarId, setConfirmEliminarId] = useState(null);
    // Popup de resultado tras eliminar — mismo patrón que el ResultModal de
    // gastos/ingresos en Dashboard.jsx y Movements.jsx.
    const [resultado, setResultado] = useState(null);

    const fetchear = useCallback(async () => {
        setCargando(true);
        try {
            const data = await fetchItems();
            setItems(data);
        } catch (err) {
            console.error(`❌ Error al cargar ${nombreEntidad}:`, err);
        } finally {
            setCargando(false);
        }
    }, [fetchItems, nombreEntidad]);

    useEffect(() => {
        fetchear();
    }, [fetchear]);

    // Verifica duplicado local por nombre (case-insensitive) antes de llamar a crearItem.
    // Devuelve true si el nombre ya existe (y ya seteó el error correspondiente).
    const validarDuplicado = (nombre) => {
        const existe = items.some(
            it => getNombre(it).toLowerCase() === nombre.trim().toLowerCase()
        );
        if (existe) {
            setError(`Ya existe ${nombreEntidad} con ese nombre`);
        }
        return existe;
    };

    const crear = async (input) => {
        setGuardando(true);
        setError('');
        try {
            const creado = await crearItem(input);
            setItems(prev => [...prev, creado].sort((a, b) => getNombre(a).localeCompare(getNombre(b))));
            return creado;
        } catch (err) {
            setError(err.message || `Error al crear ${nombreEntidad}`);
            return null;
        } finally {
            setGuardando(false);
        }
    };

    const eliminar = async (id) => {
        setEliminandoId(id);
        setError('');
        const itemEliminado = items.find(it => it.id === id);
        try {
            await eliminarItem(id);
            setItems(prev => prev.filter(it => it.id !== id));
            // Solo cerramos el modal de confirmación si la eliminación fue exitosa.
            // Si falla (ej. FK constraint), lo dejamos abierto para mostrar el
            // error ahí mismo — antes se cerraba siempre, y el mensaje quedaba
            // en otra parte de la pantalla donde el usuario no lo veía.
            setConfirmEliminarId(null);
            setResultado({
                tipo: 'success',
                titulo: '¡Eliminado!',
                mensaje: itemEliminado ? `Se eliminó ${nombreEntidad} "${getNombre(itemEliminado)}".` : undefined,
            });
        } catch (err) {
            // Si hay gastos asociados, FK constraint lo bloquea
            const mensaje = err.code === '23503'
                ? `No podés eliminar ${nombreEntidad} porque tiene gastos asociados.`
                : (err.message || `Error al eliminar ${nombreEntidad}`);
            setError(mensaje);
        } finally {
            setEliminandoId(null);
        }
    };

    return {
        items, cargando, guardando, error, setError,
        eliminandoId, confirmEliminarId, setConfirmEliminarId,
        resultado, setResultado,
        validarDuplicado, crear, eliminar,
    };
};
