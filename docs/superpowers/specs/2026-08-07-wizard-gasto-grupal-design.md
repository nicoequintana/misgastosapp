# Wizard de carga de gasto grupal — Design

## Contexto

El gasto personal ya se carga mediante `GastoWizard.jsx`, un modal de pasos que
simplificó el formulario largo original. El gasto grupal todavía se carga con
un formulario tradicional de una sola pantalla (`GrupoGastoNuevo.jsx` +
`GrupoGastoForm.jsx`), con todos los campos visibles a la vez. El objetivo de
este cambio es aplicar el mismo patrón de wizard modal a la carga de gastos
grupales, manteniendo la estética glassmorphism y la consistencia de UX con el
resto de la app.

**Fuera de alcance — explícito:**
- `GastoWizard.jsx` (wizard de gasto personal) **no se toca**. Funciona
  correctamente y no forma parte de este cambio.
- La **edición** de un gasto grupal (`GrupoGastoEditar.jsx`) **no se toca**.
  Sigue siendo una página con el formulario largo (`GrupoGastoForm.jsx`), sin
  wizard. Este cambio es exclusivamente para la **creación** de gastos
  grupales.

## Componente nuevo

`client/src/components/grupos/GrupoGastoWizard.jsx` — modal de 5 pasos, mismo
patrón estructural que `GastoWizard.jsx`:
- Usa el componente `Modal` existente, con footer de navegación
  (Cancelar/Atrás/Siguiente/Guardar).
- Maneja localmente el paso actual (`pasoGasto`) y el bloqueo temporal de
  botones al cambiar de paso (~400ms), igual que `GastoWizard`.
- Fases visuales: `form` → `guardando` → `resultado`, con `ResultModal` al
  final — mismo patrón que el gasto personal.
- Reutiliza `useGrupoGastoForm` (modo `'crear'`) para todo el estado, validación
  y submit. **No se modifica el contrato del hook** — el estado de paso vive
  fuera de él, en el componente wizard, igual que `GastoWizard` no delega su
  paso a ningún hook de datos. Esto es lo que garantiza que
  `GrupoGastoEditar.jsx` (que también usa `useGrupoGastoForm`, en modo
  `'editar'`) no se vea afectado por este cambio.

## Punto de entrada

En `GrupoDetalle.jsx` (líneas ~413-419), el botón "Cargar gasto" hoy hace
`navigate(`/grupos/${grupo.id}/gastos/nuevo`)`. Pasa a abrir el modal
(`useState` de `wizardAbierto`) en su lugar.

## Páginas/rutas eliminadas

- `client/src/pages/grupos/GrupoGastoNuevo.jsx`
- Su test `GrupoGastoNuevo.test.jsx`
- La ruta `/grupos/:id/gastos/nuevo` en el router

`GrupoGastoForm.jsx` queda vigente, pero pasa a ser usado únicamente por
`GrupoGastoEditar.jsx`.

## Pasos del wizard

**Paso 1 — Monto y descripción**
- Monto (`CurrencyInput`, autofocus). Obligatorio, > 0.
- Descripción. Obligatoria (a diferencia del wizard personal, donde es
  opcional — en grupos la descripción siempre fue requerida y se mantiene así).

**Paso 2 — Categoría y método de pago**
- Categoría (`ChipSelector`, opcional).
- Método de pago (`ChipSelector`, obligatorio).
- Si el método acepta cuotas (`acepta_cuotas === true`): Cuotas (select,
  `OPCIONES_CUOTAS`) + Mes de la primera cuota (`type="month"`), ambos
  obligatorios — mismo comportamiento que existe hoy en `GrupoGastoForm`.

**Paso 3 — Pagado por**
- Select de miembros activos del grupo. Obligatorio. Default: usuario actual
  (`user.id`).

**Paso 4 — Participantes y nota**
- `MiembrosSelector` (obligatorio, mínimo 1 participante). Default: todos los
  miembros activos.
- Nota (textarea, opcional).

**Paso 5 — Resumen**
- Preview de división igualitaria (`divisionPreview`, ya calculado por
  `useGrupoGastoForm`) — incluye el caso de cuotas (monto por cuota/persona) y
  el caso simple (monto base + diferencia de redondeo absorbida por el
  pagador).
- Repaso no editable de: descripción, monto, categoría, método de pago
  (+ cuotas si aplica), pagado por, participantes.
- Botón "Guardar" dispara `handleSubmit` del hook (fase `guardando` →
  `resultado`).

## Validación por paso

Cada paso valida solo sus propios campos antes de permitir avanzar
(`validarPasoGasto(paso)`), reutilizando los mismos mensajes de error que ya
existen en `validar()` dentro de `useGrupoGastoForm`. No se duplica lógica de
validación, solo se fracciona su punto de disparo.

## Campo fecha

Se elimina como campo editable del wizard. La fecha del gasto se fija
automáticamente a `fechaHoyArgentina()` al momento de guardar — mismo
comportamiento que el wizard de gasto personal. Los gastos grupales dejan de
poder cargarse con fecha retroactiva manual a través del wizard.

## Testing

- Test nuevo para `GrupoGastoWizard.jsx` (navegación entre pasos, validación
  por paso, submit final, casos con/sin cuotas).
- Verificar que `GrupoGastoEditar.test.jsx` siga pasando sin cambios (garantía
  de que no se rompió el modo edición).
- Eliminar `GrupoGastoNuevo.test.jsx` junto con la página que testea.
