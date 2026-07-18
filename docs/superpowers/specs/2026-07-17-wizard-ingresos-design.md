# Diseño: Wizard de 2 pasos para el flujo de ingresos (Dashboard)

**Fecha:** 2026-07-17
**Estado:** Aprobado por Nicolás — listo para writing-plans

## Contexto y motivación

El modal de Ingresos ya tiene chips (categoría, tipo de ingreso) y loader in-modal (spinner→resultado) aplicados en la iteración anterior ([2026-07-17-chips-loader-ingresos-design.md](2026-07-17-chips-loader-ingresos-design.md)). Ese diseño mantuvo el modal como panel persistente: formulario siempre visible + lista de ingresos del mes debajo, ambos convivendo.

Nicolás pidió ahora que el ingreso funcione como wizard, igual que gastos: pasos secuenciales en vez de un formulario completo de una vez.

## Qué NO cambia

- Los campos del formulario (Monto, Descripción, Categoría, Tipo de ingreso) no cambian de nombre ni de tipo de control (siguen siendo `CurrencyInput`, input de texto, `ChipSelector`, `ChipSelector`).
- El mecanismo de fases `faseIngreso: 'form' | 'guardando' | 'resultado'` (spinner→resultado dentro del mismo modal, sin cerrar) se mantiene igual — se aplica ahora sobre el wizard en vez de sobre el formulario plano.
- El `ConfirmModal` de eliminar ingreso/recurrente no cambia.
- Las validaciones y llamadas a `db.js` (`createIncome`, `updateIncome`, `createRecurringIncome`, `deleteIncome`, `deleteRecurringIncome`) no cambian.
- Al confirmar el resultado ("Continuar"), el modal sigue sin cerrarse — es la diferencia estructural con gastos que ya se estableció y se mantiene.

## Qué cambia

### 1. El modal pasa a tener dos vistas: lista y wizard

Nuevo state `vistaIngreso: 'lista' | 'wizard'`.

- **`lista`** (vista por defecto al abrir "Ingresos" desde el dashboard): muestra la lista de ingresos del mes, el total, la lista de recurrentes activos, y un botón **"Nuevo ingreso"** que abre el wizard. Ya NO muestra el formulario siempre visible — eso es lo que pasa a vivir exclusivamente en la vista `wizard`.
- **`wizard`**: muestra el formulario de alta/edición dividido en 2 pasos (ver abajo). Se entra a esta vista desde el botón "Nuevo ingreso" (alta, formulario vacío) o desde el ícono "editar" de un ingreso en la lista (edición, formulario precargado, wizard arranca en paso 1 igual que el alta).

### 2. Pasos del wizard

Nuevo state `pasoIngreso` (1 o 2), mismo mecanismo que `pasoGasto` en el modal de gastos (incluyendo el fix de `key` en los botones del footer para evitar el bug de reconciliación de DOM ya resuelto ahí).

- **Paso 1**: Monto (`CurrencyInput`) + Descripción (opcional).
- **Paso 2**: Categoría (`ChipSelector`, con el chip "Sin categoría") + Tipo de ingreso (`ChipSelector` Puntual/Recurrente, **solo visible si no se está editando** — mismo condicional que ya existe hoy). Botón "Guardar" en este paso (último paso).

Validación al avanzar de paso 1 a 2: monto > 0 (igual que la validación que ya existe en `handleSaveIncome`, movida a validarse por paso en vez de solo al submit final — mismo patrón que `validarPasoGasto` en gastos).

La lista de ingresos/recurrentes NO se muestra durante la vista `wizard` (ni en paso 1 ni en paso 2) — solo el formulario del paso activo, mismo layout que gastos.

### 3. Flujo de edición

Al tocar "editar" en un ingreso de la lista: `vistaIngreso: 'wizard'`, `pasoIngreso: 1`, `incomeForm` precargado con los datos del ingreso (mismo `handleEditarIngreso` ya existente, sin cambios en su lógica de precarga). El wizard arranca en paso 1 igual que el alta — el usuario ve Monto/Descripción ya completados y puede modificarlos, avanza a paso 2 y ve la Categoría ya seleccionada (sin el chip "Tipo de ingreso", igual que hoy).

### 4. Flujo de guardado y resultado

Sin cambios respecto a la iteración anterior: al tocar "Guardar" en el paso 2, `faseIngreso` pasa a `'guardando'` (spinner, oculta wizard) y luego a `'resultado'` (éxito/error). Al tocar "Continuar": vuelve a `vistaIngreso: 'lista'` (no a `'wizard'`) con `faseIngreso: 'form'`, `pasoIngreso: 1`, formulario reseteado, y la lista recargada — mismo criterio que "el modal no se cierra" ya establecido, pero ahora el punto de retorno es la vista de lista en vez del formulario plano.

### 5. Eliminar (ingreso o recurrente)

No pasa por el wizard — se dispara directamente desde los íconos de eliminar en la vista `lista` (como hoy), abre el `ConfirmModal` existente, y al confirmar transiciona `faseIngreso` a `guardando`→`resultado` **sin cambiar `vistaIngreso`** (la vista de lista se mantiene detrás, igual que ya pasa hoy con el modal de gastos cuando el spinner se muestra sobre el contenido activo).

### 6. Cierre del modal

Al cerrar el modal manualmente (X del header, o click afuera) desde la vista `lista`: cierra igual que hoy. Si el usuario está en la vista `wizard` y cierra: también cierra el modal completo (no solo vuelve a la lista) — mismo comportamiento que cancelar en gastos. Al reabrir el modal (`handleAbrirIngresos`), siempre arranca en `vistaIngreso: 'lista'`, `faseIngreso: 'form'`, `pasoIngreso: 1`.

## Fuera de alcance

- No se agrega botón "Atrás" desde el paso 1 a la vista de lista (cancelar desde paso 1 cierra el modal completo, igual que gastos) — desde paso 2 sí hay "Atrás" hacia paso 1 (mismo patrón que gastos).
- No se cambia el criterio de "editar no muestra el chip de tipo de ingreso" — se mantiene igual.
- No se agrega un tercer paso ni se reordenan los campos existentes más allá de la división en 2 pasos ya acordada.

## Archivos afectados

- `client/src/pages/Dashboard.jsx` — nuevo state `vistaIngreso`/`pasoIngreso`, nuevo botón "Nuevo ingreso" en la vista lista, división del formulario en 2 pasos con footer de wizard (Atrás/Siguiente/Guardar, con `key` en los botones), ajustar `handleAbrirIngresos`/`handleEditarIngreso`/`handleVolverFormularioIngreso` para manejar `vistaIngreso`.
