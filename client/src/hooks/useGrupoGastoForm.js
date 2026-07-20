import { useState, useEffect, useContext, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import * as db from '../lib/db';
import { fechaHoyArgentina, formatCurrency } from '../utils/format';
import { calcularDivisionIgualitaria } from '../lib/cuotasHelper';
import { limpiarSufijoCuota } from '../lib/cuotasGroupHelper';

export const OPCIONES_CUOTAS = Array.from({ length: 18 }, (_, i) => i + 1);

/**
 * Estado y lógica compartida del formulario de gasto grupal, usado tanto para
 * crear (GrupoGastoNuevo) como para editar (GrupoGastoEditar) un gasto.
 * En modo 'editar' precarga el gasto existente; en modo 'crear' arranca vacío
 * con el usuario actual como pagador por defecto.
 */
export const useGrupoGastoForm = ({ grupoId, gastoId, modo }) => {
    const { user } = useContext(AuthContext);

    // Estado de datos del grupo
    const [miembros, setMiembros] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [metodosPago, setMetodosPago] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState(null);

    // Estado del formulario
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState(0);
    const [fecha, setFecha] = useState(() => (modo === 'crear' ? fechaHoyArgentina() : ''));
    const [categoriaId, setCategoriaId] = useState('');
    const [metodoPagoId, setMetodoPagoId] = useState('');
    const [pagadoPor, setPagadoPor] = useState('');
    const [participantes, setParticipantes] = useState([]);
    const [nota, setNota] = useState('');
    const [esTarjeta, setEsTarjeta] = useState(false);
    const [cuotas, setCuotas] = useState(1);
    const [primeraCuota, setPrimeraCuota] = useState('');

    // Estado de envío
    const [errorGuardado, setErrorGuardado] = useState(null);
    // Fase visual del formulario: 'form' (edición), 'guardando' (spinner mientras
    // corre la llamada a db) o 'resultado' (popup de éxito/error). Mismo patrón que
    // el modal de gasto individual en Dashboard.jsx.
    const [fase, setFase] = useState('form');
    const [resultado, setResultado] = useState(null);

    // Carga los miembros activos del grupo, categorías y métodos de pago (y, en
    // modo editar, el gasto existente) al montar.
    const cargarDatos = useCallback(async () => {
        if (!grupoId || (modo === 'editar' && !gastoId)) return;
        try {
            setCargando(true);
            setErrorCarga(null);

            const [datosMiembros, datosCategorias, datosMetodos, gastoExistente] = await Promise.all([
                db.obtenerMiembrosDelGrupo(grupoId),
                db.getCategories(),
                db.getPaymentMethods(),
                modo === 'editar' ? db.obtenerGastoConParticipantes(gastoId) : Promise.resolve(null),
            ]);

            const activos = (datosMiembros || []).filter((m) => m.estado === 'activo');
            setMiembros(activos);
            setCategorias((datosCategorias || []).filter((c) => !c.es_propia));
            setMetodosPago(datosMetodos || []);

            if (modo === 'editar' && gastoExistente) {
                // Poblar formulario con los datos del gasto. Si es una cuota, la
                // descripción guardada trae el sufijo "(N/total)" (ej. "VIAJE (1/3)")
                // — se limpia para no mostrárselo al usuario ni reenviarlo duplicado
                // al guardar.
                setDescripcion(limpiarSufijoCuota(gastoExistente.descripcion));
                setFecha(gastoExistente.fecha ? gastoExistente.fecha.split('T')[0] : fechaHoyArgentina());
                setCategoriaId(gastoExistente.id_categoria ? String(gastoExistente.id_categoria) : '');
                setPagadoPor(gastoExistente.pagado_por || '');
                setNota(gastoExistente.nota || '');
                setParticipantes((gastoExistente.participantes || []).map((p) => p.user_id));

                // Método de pago: precargar el chip activo y derivar esTarjeta del flag acepta_cuotas
                const metodoIdExistente = gastoExistente.id_metodo_pago ? String(gastoExistente.id_metodo_pago) : '';
                setMetodoPagoId(metodoIdExistente);
                const metodoExistente = (datosMetodos || []).find(
                    pm => pm.id === gastoExistente.id_metodo_pago
                );
                setEsTarjeta(metodoExistente?.acepta_cuotas === true);

                // Si es compra en cuotas: gastoExistente.monto es el monto de ESTA cuota
                // puntual (cada fila de grupo_gastos guarda su propia porción), no el
                // total de la compra. Para editar, el usuario debe ver/cambiar el total
                // original y la cantidad real de cuotas — se obtienen sumando todas las
                // cuotas hermanas (mismo id_gasto_padre).
                const esCuotasGasto = (gastoExistente.cuotas || 1) > 1;
                if (esCuotasGasto && gastoExistente.fecha) {
                    const idPadre = gastoExistente.id_gasto_padre || gastoExistente.id;
                    const cuotasHermanas = await db.obtenerCuotasDeCompra(idPadre);
                    const totalOriginal = cuotasHermanas.reduce((s, c) => s + Number(c.monto), 0);
                    setMonto(Math.round(totalOriginal * 100) / 100);
                    setCuotas(gastoExistente.cuotas);
                    setPrimeraCuota(gastoExistente.fecha.slice(0, 7));
                } else {
                    setMonto(Number(gastoExistente.monto) || 0);
                }
            } else {
                // Por defecto, el pagador es el usuario actual
                if (user?.id) setPagadoPor(user.id);
                // Por defecto, todos los miembros activos son participantes
                setParticipantes(activos.map((m) => m.user_id));
            }
        } catch (err) {
            console.error('Error al cargar datos del formulario de gasto grupal:', err);
            setErrorCarga(
                modo === 'editar'
                    ? 'No se pudo cargar el gasto. Verificá que exista o que tengas permisos.'
                    : 'No se pudieron cargar los miembros del grupo.'
            );
        } finally {
            setCargando(false);
        }
    }, [grupoId, gastoId, modo, user?.id]);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    // Detecta si el método de pago seleccionado acepta cuotas (flag explícito en
    // metodos_pago.acepta_cuotas) — mismo criterio que handleCambioMetodoPago en Dashboard.jsx.
    const handleCambioMetodoPago = (id) => {
        const metodo = metodosPago.find(pm => pm.id === Number(id) || pm.id === id);
        const aceptaCuotas = metodo?.acepta_cuotas === true;
        setMetodoPagoId(id);
        setEsTarjeta(aceptaCuotas);
        if (!aceptaCuotas) { setCuotas(1); setPrimeraCuota(''); }
    };

    // Calcula el preview de división igualitaria.
    // Si es tarjeta, muestra el monto por cuota por participante.
    const calcularPreview = () => {
        const n = participantes.length;
        if (!n || !monto || monto <= 0) return null;

        if (esTarjeta) {
            // Monto de la primera cuota (puede absorber diferencia de redondeo)
            const montoPorCuota = Math.floor((monto / cuotas) * 100) / 100;
            const diferenciaCuota = Math.round((monto - montoPorCuota * cuotas) * 100) / 100;
            const montoPrimeraCuota = Math.round((montoPorCuota + diferenciaCuota) * 100) / 100;

            // División de la primera cuota entre participantes
            const divisionPrimera = calcularDivisionIgualitaria(montoPrimeraCuota, participantes, pagadoPor);
            const montoPorPersona = divisionPrimera.find(d => d.user_id !== pagadoPor)?.monto_asignado
                ?? divisionPrimera[0]?.monto_asignado
                ?? 0;

            return {
                esTarjeta:        true,
                cuotas,
                montoCuota:       montoPrimeraCuota,
                montoPorPersona,
                participantes:    n,
            };
        }

        const base = Math.floor((monto / n) * 100) / 100;
        const diferencia = Math.round((monto - base * n) * 100) / 100;
        return { esTarjeta: false, base, diferencia, tieneDiferencia: diferencia > 0 };
    };

    const divisionPreview = calcularPreview();

    // Formatea monto en estilo argentino con signo $
    const formatearMonto = (val) => formatCurrency(val, { conSigno: true });

    // Validaciones client-side compartidas entre crear y editar
    const validar = () => {
        if (!descripcion.trim()) return 'La descripción es obligatoria.';
        if (!monto || monto <= 0) return 'El monto debe ser mayor a cero.';
        if (participantes.length === 0) return 'Seleccioná al menos un participante.';
        if (!pagadoPor) return 'Seleccioná quién pagó.';
        if (!metodoPagoId) return 'Seleccioná un método de pago.';
        if (esTarjeta && !primeraCuota) return 'Indicá en qué mes vence la primera cuota.';
        return null;
    };

    // Ejecuta la validación y, si pasa, corre `onSubmit` mostrando el spinner y
    // el resultado final (éxito o error) según corresponda.
    const handleSubmit = async (e, { onSubmit, mensajeExito, mensajeErrorTitulo }) => {
        e.preventDefault();
        setErrorGuardado(null);

        const errorValidacion = validar();
        if (errorValidacion) {
            setErrorGuardado(errorValidacion);
            return;
        }

        setFase('guardando');

        try {
            await onSubmit();
            setResultado({ tipo: 'success', titulo: mensajeExito });
            setFase('resultado');
        } catch (err) {
            console.error('Error al guardar el gasto grupal:', err);
            setResultado({ tipo: 'error', titulo: mensajeErrorTitulo, mensaje: err.message });
            setFase('resultado');
        }
    };

    // Vuelve del popup de resultado (error) al formulario para reintentar
    const volverAFormulario = () => {
        setFase('form');
        setResultado(null);
    };

    return {
        // datos
        miembros, categorias, metodosPago, cargando, errorCarga,
        // formulario
        descripcion, setDescripcion,
        monto, setMonto,
        fecha, setFecha,
        categoriaId, setCategoriaId,
        metodoPagoId, handleCambioMetodoPago,
        pagadoPor, setPagadoPor,
        participantes, setParticipantes,
        nota, setNota,
        esTarjeta,
        cuotas, setCuotas,
        primeraCuota, setPrimeraCuota,
        // envío
        errorGuardado, fase, resultado, handleSubmit, volverAFormulario,
        // derivados
        divisionPreview, formatearMonto,
        user,
    };
};
