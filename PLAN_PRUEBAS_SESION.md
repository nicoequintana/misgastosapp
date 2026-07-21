# Plan de pruebas — sesión R1/R2/R6/R7/UX-17

> Cobertura manual de lo tocado hoy. Automatizado (338 tests) ya está verde — esto es para confirmar el comportamiento observable real en el navegador, sobre todo en los flujos de mayor uso diario.

---

## 1. Dashboard — Wizard de Gasto (R6 + UX-17)

### 1.1 Camino feliz — gasto simple
- [ ] Abrir Dashboard, hacer clic en "Gastos Variables" (o el botón de nuevo gasto).
- [ ] El wizard abre directo en el paso correcto — si entraste por "Gastos Fijos"/"Gastos Variables", el paso 3 (fijo/variable) **no debe aparecer** (ya viene preseleccionado).
- [ ] Completar monto + descripción → Siguiente.
- [ ] Elegir categoría + método de pago (uno que **no** acepte cuotas) → Siguiente/Guardar.
- [ ] Ver el popup de resultado "¡Gasto registrado!" con botón "Continuar".
- [ ] Cerrar. El gasto aparece en la tabla de "Gastos Recientes" del Dashboard.

### 1.2 Gasto con tarjeta de crédito (cuotas)
- [ ] Nuevo gasto → elegir un método de pago que acepta cuotas.
- [ ] Verificar que aparecen los campos "Cuotas" y "Mes de la primera cuota".
- [ ] Intentar avanzar/guardar sin completar "Mes de la primera cuota" → debe bloquear con el mensaje "Indicá en qué mes vence la primera cuota."
- [ ] Completar y guardar. Verificar que la card de "Tarjeta en cuotas" del Dashboard se actualiza con el nuevo gasto.

### 1.3 Gasto de categoría préstamo
- [ ] Elegir una categoría marcada como préstamo.
- [ ] Verificar que aparecen los campos de cuotas/primera cuota específicos de préstamo (mensaje distinto: "fecha del primer pago").
- [ ] Guardar. Verificar que la card de "Préstamos" del Dashboard se actualiza.

### 1.4 Validación on-blur del monto (UX-17)
- [ ] Nuevo gasto → hacer clic en el campo Monto y salir sin escribir nada (perder foco).
- [ ] Debe aparecer el mensaje "El monto debe ser mayor a cero." **debajo del campo**, sin haber tocado "Siguiente".
- [ ] Escribir un monto válido → el mensaje debe desaparecer inmediatamente (sin necesidad de perder foco de nuevo).

### 1.5 Validación on-blur de primera cuota (UX-17)
- [ ] Con tarjeta/préstamo seleccionado, hacer clic en "Mes de la primera cuota" y salir sin completar.
- [ ] Debe aparecer el mensaje inline correspondiente antes de intentar guardar.

### 1.6 Cancelar / cerrar sin flash visual
- [ ] Abrir el wizard, completar algo, y cerrar con el botón "Cancelar" o la X.
- [ ] Reabrir el wizard: debe arrancar limpio en el paso 1, **sin** mostrar por un instante el wizard vacío "destellando" durante el cierre anterior (es el detalle del fade-out de 300ms).

### 1.7 Error de guardado
- [ ] (Si es posible simular, ej. cortando la conexión un instante) Verificar que un error de guardado muestra el popup de resultado en rojo con el mensaje de error y botón "Continuar", sin trabar el wizard.

---

## 2. Dashboard — Modal de Ingresos (R6 + UX-17)

### 2.1 Vista de lista
- [ ] Clic en "Ingresos" desde el Dashboard.
- [ ] Debe abrir en la vista de lista (ingresos del mes + recurrentes configurados), no directo en el wizard.
- [ ] Si no hay ingresos del mes, debe verse el mensaje "Todavía no registraste ingresos este mes."

### 2.2 Alta de ingreso puntual
- [ ] "Nuevo ingreso" → completar monto + descripción → Siguiente.
- [ ] Elegir categoría (opcional) + tipo "Puntual" → Agregar ingreso.
- [ ] Ver resultado de éxito, volver a la lista, confirmar que el nuevo ingreso aparece con su monto y descripción.
- [ ] El saldo disponible del Dashboard debe actualizarse tras cerrar.

### 2.3 Alta de ingreso recurrente
- [ ] "Nuevo ingreso" → completar → paso 2 → tipo "Recurrente" → Agregar.
- [ ] Verificar que aparece tanto en "Ingresos de este mes" como en "Recurrentes configurados".

### 2.4 Editar ingreso / recurrente
- [ ] Clic en editar (ícono lápiz) sobre un ingreso puntual → debe precargar el formulario, título "Editar ingreso", botón "Actualizar".
- [ ] Modificar el monto y guardar → verificar que se actualiza en la lista.
- [ ] Repetir con un recurrente (título debe decir "Editar recurrente"; el selector de tipo puntual/recurrente **no** debe aparecer al editar).

### 2.5 Eliminar ingreso / recurrente
- [ ] Clic en eliminar sobre un ingreso puntual → debe aparecer el `ConfirmModal` ("¿Querés eliminar este ingreso?").
- [ ] Confirmar → el ingreso desaparece de la lista y el saldo del Dashboard se recalcula.
- [ ] Repetir con un recurrente (mensaje distinto: "Se eliminarán los próximos registros automáticos...").
- [ ] **Punto de atención conocido**: al eliminar un recurrente, el saldo del Dashboard **no** se refresca automáticamente (comportamiento preexistente, no introducido hoy) — confirmar que sigue siendo así y no rompe nada visualmente.

### 2.6 Validación on-blur del monto (UX-17)
- [ ] "Nuevo ingreso" → salir del campo Monto vacío → debe aparecer "El monto debe ser mayor a cero." sin tocar Siguiente.
- [ ] Corregir el valor → el mensaje desaparece.

---

## 3. Grupos — Alta/edición de gasto grupal (UX-17)

### 3.1 Validación on-blur por campo
- [ ] Ir a un grupo → "Nuevo gasto" (o editar uno existente).
- [ ] Salir de "Descripción" vacía → mensaje "La descripción es obligatoria." inline.
- [ ] Salir de "Monto" vacío/cero → mensaje "El monto debe ser mayor a cero." inline.
- [ ] Salir de "Fecha" vacía (si se puede vaciar el date picker) → mensaje "La fecha es obligatoria." inline.
- [ ] Salir de "Pagó" sin seleccionar → mensaje "Seleccioná quién pagó." inline.
- [ ] Si el método de pago acepta cuotas: salir de "Mes de la primera cuota" vacío → mensaje inline.
- [ ] En todos los casos: corregir el campo → el mensaje debe desaparecer sin perder foco de nuevo.

### 3.2 Camino feliz de gasto grupal
- [ ] Completar todos los campos + participantes → Guardar.
- [ ] Verificar que el gasto aparece en el detalle del grupo con la división correcta entre participantes.

### 3.3 Gasto grupal en cuotas (tarjeta)
- [ ] Elegir método de pago con cuotas → completar cuotas + primera cuota → Guardar.
- [ ] Verificar el preview de división ("Cada uno paga... por mes durante N cuotas").
- [ ] Confirmar que se crean todas las cuotas vinculadas correctamente (revisar en "Grupos > Cuotas" o el detalle del gasto).

### 3.4 Editar gasto grupal existente
- [ ] Abrir edición de un gasto grupal ya creado → los campos deben precargar los valores actuales.
- [ ] Cambiar el monto y guardar → verificar que se actualiza sin duplicar ni corromper la división entre participantes.

---

## 4. Notificaciones / Alertas (R7)

> Estas alertas se disparan automáticamente al cargar el Dashboard o al guardar un gasto — no hay una acción manual directa para "probarlas todas", así que se valida por escenario de datos.

### 4.1 Alerta de gasto alto
- [ ] En Configuración, activar "Notificar gasto alto" con un umbral bajo (ej. $100).
- [ ] Registrar un gasto que supere ese umbral.
- [ ] Verificar que aparece la notificación "Gasto alto detectado" en la campana, con el monto y umbral correctos en el mensaje.

### 4.2 Alerta de saldo bajo / porcentaje de ingreso
- [ ] Con ingreso mensual configurado, forzar que el saldo disponible caiga bajo el umbral configurado (o el % de gasto supere el límite).
- [ ] Recargar el Dashboard → debe aparecer la notificación correspondiente (una sola vez por día — el throttle debe seguir funcionando).

### 4.3 Alerta de ingreso no configurado
- [ ] Con un usuario sin ingreso mensual cargado (o poniéndolo en 0 temporalmente), recargar el Dashboard.
- [ ] Debe aparecer "Ingreso mensual no configurado" y **no** deben aparecer las demás alertas financieras al mismo tiempo (cortocircuito).

### 4.4 Resúmenes (si están habilitados por email o botón manual)
- [ ] Si hay un disparador manual de resumen diario/semanal/mensual en la UI, probarlo y confirmar que el mensaje/formato coincide con lo esperado (montos, fechas, top categorías).

### 4.5 Throttle sigue funcionando
- [ ] Disparar la misma alerta dos veces en el mismo día (ej. dos gastos altos seguidos) → la segunda notificación **no** debe repetirse (throttle en localStorage sigue activo).

---

## 5. Backend — Grupos (R2, verificación indirecta vía UI)

> El split de `server/routes/grupos.js` no cambia contratos de API, así que se valida usando la UI de grupos normalmente. Puntos de atención específicos:

- [ ] Crear una invitación a un grupo → el email de invitación llega correctamente.
- [ ] Aceptar una invitación desde el link del email.
- [ ] Buscar un usuario por email dentro de un grupo (`/usuarios/buscar`).
- [ ] Ver perfiles de miembros del grupo.
- [ ] **Eliminar un grupo completo** — este endpoint tuvo un fix aparte (`BACKEND_URL` faltante) en R1, probarlo específicamente: debe funcionar tanto en dev como collateral-check de que no tira error de red.
- [ ] Registrar una liquidación entre dos miembros → el saldo se actualiza correctamente en ambos.
- [ ] Anular una liquidación → el saldo vuelve al estado anterior.
- [ ] Anular un gasto grupal (simple y en cuotas) → verificar que el saldo se recalcula bien.

---

## 6. Regresión general (smoke test)

- [ ] Login con Google funciona normalmente.
- [ ] Logout invalida la sesión (no queda logueado si volvés a entrar).
- [ ] Navegación entre Dashboard / Movimientos / Reportes / Grupos / Configuración sin errores en consola.
- [ ] Abrir la consola del navegador durante todo el recorrido — **cero errores rojos** (warnings amarillos de libs externas son aceptables, pero nada del código propio).

---

## Qué hacer si algo falla

Si cualquier ítem falla, anotá: qué paso exacto, qué esperabas vs qué pasó, y si hay algo en la consola del navegador. Con eso puedo ir directo al archivo/función involucrada en vez de re-explorar todo el flujo.
