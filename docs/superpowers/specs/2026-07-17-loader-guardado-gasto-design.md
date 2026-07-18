# Diseño: Loader de guardado en el modal de nuevo gasto (Dashboard)

**Fecha:** 2026-07-17
**Estado:** Aprobado por Nicolás — listo para writing-plans

## Contexto y motivación

Hoy, al confirmar el gasto en el paso final del wizard, `handleSubmitExpense` hace `await db.createExpense(...)` sin ningún feedback visual de "guardando". Al resolver, cierra el modal del wizard (`setIsModalOpen(false)`) y, en el mismo tick, abre un modal distinto (`ResultModal`, controlado por `resultadoGasto`). Como cada modal es un `Modal` independiente con su propia animación de entrada/salida (300ms, ver `Modal.jsx`), el usuario percibe: wizard se cierra → luego aparece el popup de éxito, en vez de una transición continua.

Nicolás pidió: al tocar "Guardar", debe aparecer un loader y luego directamente el popup de resultado, sin ese corte perceptible.

## Qué NO cambia

- `ResultModal.jsx` como componente no se modifica — sigue usándose igual en `Movements.jsx` (editar/eliminar gasto).
- La lógica de negocio de `handleSubmitExpense` (validaciones, `db.createExpense`, notificaciones, recarga de stats) no cambia — solo se reordena cuándo se muestran/ocultan las fases visuales.
- El wizard de 3 pasos (monto → categoría/método/cuotas → fijo/variable) no cambia.

## Qué cambia

### 1. Nuevo state de fase en Dashboard.jsx

Se reemplaza el patrón de dos modales (`isModalOpen` + `resultadoGasto` como modales separados) por **una sola fase** dentro del modal ya abierto:

```js
const [faseGasto, setFaseGasto] = useState('form'); // 'form' | 'guardando' | 'resultado'
```

- `resultadoGasto` se mantiene como state (guarda `{ tipo, titulo }`) pero ya no controla un `ResultModal` aparte — controla qué se pinta cuando `faseGasto === 'resultado'`.
- `isModalOpen` sigue siendo el único flag que monta/desmonta el `Modal`. Solo se pone en `false` cuando el usuario cierra el popup de resultado (botón "Continuar" o la X), no antes.

### 2. Flujo de `handleSubmitExpense`

1. Validaciones (sin cambios).
2. `setFaseGasto('guardando')` — antes de llamar a `db.createExpense`.
3. `await db.createExpense(...)`.
4. Éxito: `setResultadoGasto({ tipo: 'success', titulo: '¡Gasto registrado!' })` + `setFaseGasto('resultado')`. Notificación (`agregarNotificacion`) y recargas de stats/cuotas siguen disparándose igual que hoy, en paralelo, sin bloquear la UI.
5. Error (catch): `setResultadoGasto({ tipo: 'error', titulo: ... })` + `setFaseGasto('resultado')` — incluye el caso error para que el loader nunca quede colgado.
6. El modal se cierra (`setIsModalOpen(false)`) solo cuando el usuario toca el botón del popup de resultado. Al cerrar, se resetea `faseGasto` a `'form'` y `expenseForm`/`pasoGasto` a su estado inicial (mismo reset que ya existe hoy, movido al cierre).

### 3. Render del modal único

Dentro del mismo `<Modal isOpen={isModalOpen}>`:

- `faseGasto === 'form'` → header con `title="Nuevo Gasto"` / `subtitle="Paso X de Y"`, body = wizard actual, footer = botones Atrás/Siguiente/Guardar (sin cambios de lógica, ya con `key` fijo del fix anterior).
- `faseGasto === 'guardando'` → `title`/`subtitle` no se pasan (o `undefined`) para que `Modal` no renderice `modal-header`; `footer` tampoco se pasa. Body = spinner centrado.
- `faseGasto === 'resultado'` → mismo esquema sin header/footer; body = el JSX que hoy vive en `ResultModal` (ícono + título + botón "Continuar"), pero inline dentro de este modal en vez de un `ResultModal` separado.

### 4. Spinner de "guardando"

Reutiliza la clase `result-modal` existente (mismo padding/centrado que usa `ResultModal` para ícono+título) para mantener consistencia visual glassmorphism. Ícono: `<span className="material-symbols-outlined result-modal__icono result-modal__icono--loading">progress_activity</span>` con una animación CSS de rotación continua (`@keyframes girar` + `animation: girar 1s linear infinite`), agregada a `index.css` junto a los estilos de `result-modal` ya existentes. Texto debajo: "Guardando gasto...".

### 5. Modal.jsx

No requiere cambios de lógica — ya soporta `title`/`subtitle`/`footer` opcionales (renderizado condicional existente). Solo se aprovecha pasando `undefined` en esas props durante `guardando`/`resultado`.

## Fuera de alcance

- No se toca el flujo de edición/eliminación de gastos en `Movements.jsx` — sigue usando `ResultModal` como modal independiente.
- No se agrega loader a otras acciones (ingresos, categorías, etc.) — solo al alta de gasto en el Dashboard, que es lo pedido.
- No se cambia la duración de las animaciones de `Modal.jsx` (300ms), solo se evita el ciclo cierre+apertura entre dos modales distintos.

## Archivos afectados

- `client/src/pages/Dashboard.jsx` — nuevo state `faseGasto`, reordenar `handleSubmitExpense`, render condicional por fase dentro del modal único, quitar el `<ResultModal>` separado del flujo de alta de gasto.
- `client/src/index.css` — animación de spinner (`@keyframes girar`) y clase de ícono de loading, junto a los estilos de `result-modal`.
