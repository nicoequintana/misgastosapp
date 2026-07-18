# Diseño: Chips + loader in-modal para el flujo de ingresos (Dashboard)

**Fecha:** 2026-07-17
**Estado:** Aprobado por Nicolás — listo para writing-plans

## Contexto y motivación

El flujo de gastos ya tiene dos mejoras aplicadas: chips con ícono en vez de selects/checkboxes nativos ([2026-07-16-simplificacion-carga-gastos-design.md](2026-07-16-simplificacion-carga-gastos-design.md)), y un loader in-modal que muestra spinner→resultado sin cerrar/abrir modales distintos ([2026-07-17-loader-guardado-gasto-design.md](2026-07-17-loader-guardado-gasto-design.md)). Este diseño extiende ambos patrones al modal de Ingresos.

A diferencia del modal de gastos (un wizard de pasos que termina y se cierra), el modal de Ingresos es un **panel persistente**: formulario de alta/edición + lista de ingresos del mes, pensado para cargar varios ingresos seguidos sin cerrar el modal. Esa diferencia estructural se preserva — el resultado no cierra el modal, vuelve al formulario.

Hoy el modal de Ingresos no tiene ningún feedback inmediato al guardar/editar/eliminar — solo una notificación silenciosa del sistema de notificaciones persistente (toast) y cierre/actualización directa sin transición visible.

## Qué NO cambia

- El modal de Ingresos sigue siendo un panel persistente (formulario + lista), no se convierte en un wizard de pasos.
- El `ConfirmModal` de "¿querés eliminar este ingreso?" se mantiene igual, sin cambios — sigue siendo el paso de confirmación antes de borrar.
- El campo Descripción sigue como input de texto libre (sin chips).
- El nombre "Ingresos" y toda la terminología existente no cambia.
- La lógica de negocio de `handleSaveIncome`/`handleEliminarIngreso`/`handleEliminarRecurrente` (validaciones, llamadas a `db.js`, creación de recurrente al marcar el chip) no cambia — solo se le agregan las transiciones de fase.

## Qué cambia

### 1. Modelo de datos

**Tabla `categorias_ingresos`** — nueva columna:
| Columna | Tipo | Default | Propósito |
|---|---|---|---|
| `icono` | VARCHAR(50) | `'payments'` | Nombre del ícono Material Symbols, mismo mecanismo que `categorias`/`metodos_pago` |

Migración: `server/db/migrations/20260717_chips_categorias_ingresos.sql`, a cargo del Supervisor (no de este worktree de agente, según regla del proyecto de que el schema SQL es responsabilidad exclusiva del Supervisor). Incluye asignación de íconos por defecto a categorías de ingreso existentes, a definir con Nicolás caso por caso antes de aplicar (mismo patrón que la migración de categorías/métodos de pago de gastos).

### 2. Formulario de ingreso — chips

- **Categoría** (opcional) → `ChipSelector` reutilizado tal cual (mismo componente de `client/src/components/ChipSelector.jsx`), con `opciones={categoriaIngresos}`. Se agrega un chip fijo "Sin categoría" (ícono `block` o similar) al inicio de la lista de opciones, para preservar la opción de dejar el ingreso sin categorizar que hoy ofrece el `<option value="">Sin categoría</option>` del select nativo.
- **Recurrente** (solo visible al crear, no al editar — igual que hoy) → `ChipSelector` de 2 opciones fijas: `{ id: 'puntual', nombre: 'Puntual', icono: 'event' }` / `{ id: 'recurrente', nombre: 'Recurrente', icono: 'repeat' }`, reemplazando el checkbox `es_recurrente`. Mismo patrón visual que el selector Fijo/Variable de gastos.

### 3. Fases del modal de Ingresos

Nuevo state `faseIngreso: 'form' | 'guardando' | 'resultado'`, aplicado a las 4 acciones: crear ingreso, editar ingreso, eliminar ingreso puntual, eliminar ingreso recurrente.

- **`form`**: contenido actual del modal (formulario con chips + lista de ingresos del mes), sin cambios de layout.
- **`guardando`**: mismo spinner reutilizado de gastos (clases CSS `.result-modal`, `.result-modal__icono--loading`, ya existentes — no requiere CSS nuevo).
- **`resultado`**: mismo bloque ícono+título+botón "Continuar" que gastos (ícono success/error, título, mensaje opcional). Al tocar "Continuar": vuelve a `faseIngreso: 'form'` — el modal permanece abierto (a diferencia de gastos, que sí cierra), con la lista de ingresos ya recargada, listo para la siguiente acción.

Flujo de eliminar (puntual o recurrente): el `ConfirmModal` existente no cambia — el usuario confirma ahí. Al confirmar, el `ConfirmModal` se cierra y el modal de Ingresos (que sigue abierto detrás) transiciona a `guardando`→`resultado`.

### 4. Reutilización de patrón ya validado

Mismas lecciones aprendidas en la implementación de gastos, aplicadas desde el inicio acá (no como fixes posteriores):
- El reset de `incomeForm`/`incomeEditando`/`faseIngreso` ocurre al abrir el modal (`handleAbrirIngresos`), no al cerrarlo — evita el destello de contenido stale durante la animación de cierre de `Modal.jsx`.
- Las llamadas a `fetchStats`/`fetchIngresosMes`/`fetchRecurrentes` tras estas acciones ya usan `mostrarSkeleton: false` (confirmado: `fetchStats` ya recibe ese flag en las 4 llamadas de ingresos existentes) — no hace falta tocar nada ahí, ya evitan el bug de "pantalla completa" resuelto en la iteración de gastos.
- Verificar que exista un único camino de apertura del modal de Ingresos (`handleAbrirIngresos`, ya existe) — no hay equivalente al FAB mobile de gastos para ingresos, pero se confirma en el plan de implementación que no hay otro `setIsIncomeModalOpen(true)` suelto en el archivo.

## Fuera de alcance

- No se agrega loader/resultado a ninguna otra acción del dashboard (gastos ya lo tiene, categorías/métodos de pago no están en este alcance).
- No se cambia el modelo de `ingresos_recurrentes` ni su lógica de creación automática al marcar el chip "Recurrente".
- No se agrega `IconPicker` para que el usuario elija ícono de categoría de ingreso desde la UI en esta iteración — los íconos se asignan en la migración, la gestión de categorías de ingreso (si existe) queda fuera de alcance.

## Archivos afectados

- `server/db/migrations/20260717_chips_categorias_ingresos.sql` — nueva migración (a cargo del Supervisor).
- `TECHNICAL_DOCS.md` — actualizar documentación de schema (a cargo del Supervisor).
- `client/src/pages/Dashboard.jsx` — reemplazar select/checkbox por `ChipSelector` en el formulario de ingreso, agregar state `faseIngreso` y su render condicional dentro del modal de Ingresos, actualizar `handleSaveIncome`/`handleEliminarIngreso`/`handleEliminarRecurrente`/`handleAbrirIngresos`.
