# Método de Pago + ChipSelector en Gastos Grupales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar al módulo de grupos (`GrupoGastoNuevo.jsx`, `GrupoGastoEditar.jsx`) el mismo patrón ya implementado en el módulo individual (Dashboard.jsx): selector de método de pago con `ChipSelector`, flag explícito `acepta_cuotas` en vez de checkbox manual/string hardcodeado, y fase visual `guardando`/`resultado` con spinner en el mismo modal/página.

**Architecture:** Se agrega la columna `id_metodo_pago` a `grupo_gastos` (con FK a `metodos_pago`) y se elimina la columna legacy `metodo_pago` (texto libre, hoy hardcodeada a `'TARJETA DE CREDITO'` en el flujo de cuotas). Los 3 endpoints de `server/routes/grupos.js` que tocan `grupo_gastos` (`POST /gastos`, `PUT /gastos/:gastoId`, `POST /gastos-cuotas`) reciben `idMetodoPago`, lo persisten, y resuelven "acepta cuotas" con un `select` a `metodos_pago` en vez de derivarlo de un string. En el cliente, `db.js` propaga `idMetodoPago` en los 3 llamados y reemplaza el filtro `.eq('metodo_pago', 'TARJETA DE CREDITO')` de `obtenerCuotasGrupal` por un join + filtro sobre `acepta_cuotas`. Las páginas de UI reemplazan el `<select>` de categoría y el checkbox de tarjeta por `ChipSelector`, y agregan el mismo patrón de fases (`form` → `guardando` → `resultado`) que ya existe en `Dashboard.jsx`.

**Tech Stack:** React 19, JS puro (sin TS), Express/CommonJS, Supabase JS (cliente y server con service role), Vitest + Testing Library.

---

## Contexto para quien ejecute este plan

- Trabajás en el worktree `wt-chips-carga-gastos` (rama `feat/chips-carga-gastos`), ruta:
  `c:/Users/Nico/OneDrive/Documentos/Proyectos_IA_N8N/N8N_IA/MisGastosApp/wt-chips-carga-gastos`
- El componente `ChipSelector` ya existe en `client/src/components/ChipSelector.jsx` — no lo reescribas, solo importalo. Props: `opciones` (array de `{id, nombre, icono}`), `valorSeleccionado`, `onChange`, `limiteVisible`.
- `db.getPaymentMethods()` (client/src/lib/db.js:691) ya devuelve los métodos de pago visibles (globales + propios) con los campos `acepta_cuotas`, `icono`, `tipo`. No hace falta tocarla.
- El estilo de comentarios del proyecto es siempre en español, explicando el "por qué" no el "qué".
- Los tests de `server/tests/` son unitarios sobre lógica pura reimplementada inline (no hay supertest/HTTP real contra las rutas) — seguí ese mismo patrón para los tests de backend de esta tarea, no introduzcas un framework de integración HTTP nuevo.
- La migración SQL se entrega para que Nicolás la corra en Supabase — **no se ejecuta sola**. No asumas que ya corrió al escribir el código que depende de la columna nueva; el código debe simplemente asumir que existe (se ejecuta antes de probar en dev).

---

### Task 1: Migración SQL — agregar `id_metodo_pago`, eliminar `metodo_pago`

**Files:**
- Create: `server/db/migrations/20260717_metodo_pago_gastos_grupales.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Descripción: Agrega id_metodo_pago (FK a metodos_pago) a grupo_gastos y elimina
-- la columna legacy metodo_pago (texto libre, hoy hardcodeada a 'TARJETA DE CREDITO'
-- en el flujo de cuotas). Alinea gastos grupales con el mismo flag explícito
-- acepta_cuotas que ya usa el módulo individual (migración 20260716).

ALTER TABLE grupo_gastos ADD COLUMN IF NOT EXISTS id_metodo_pago INT REFERENCES metodos_pago(id);

-- La columna metodo_pago (texto libre) queda reemplazada por el join a metodos_pago
-- vía id_metodo_pago + su flag acepta_cuotas. Se elimina para no dejar dos fuentes
-- de verdad divergentes sobre el método de pago de un gasto grupal.
ALTER TABLE grupo_gastos DROP COLUMN IF EXISTS metodo_pago;

-- Verificar tras ejecutar:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'grupo_gastos' AND column_name IN ('id_metodo_pago', 'metodo_pago');
-- (debe devolver una sola fila: id_metodo_pago)
```

- [ ] **Step 2: No commitear — `server/db/` está en `.gitignore`**

`server/db/` fue removido del repo deliberadamente (commit `98af0f7 chore: remove server/db from repo, keep local only`) y queda solo local. El archivo ya está en el lugar correcto (local, no versionado) — no ejecutar `git add` sobre él ni forzarlo con `-f`.

No ejecutar esta migración vos mismo — se entrega a Nicolás para correr en Supabase SQL Editor. Los tasks siguientes asumen que la columna ya existe en la base de datos usada para pruebas locales.

---

### Task 2: Backend — `POST /:grupoId/gastos` acepta `idMetodoPago`

**Files:**
- Modify: `server/routes/grupos.js:778-874`

- [ ] **Step 1: Agregar `idMetodoPago` a la desestructuración del body**

En `server/routes/grupos.js:781`, reemplazar:

```javascript
    const { descripcion, monto, pagadoPor, fecha, nota, idCategoria, participantesUserIds } = req.body;
```

por:

```javascript
    const { descripcion, monto, pagadoPor, fecha, nota, idCategoria, idMetodoPago, participantesUserIds } = req.body;
```

- [ ] **Step 2: Persistir `id_metodo_pago` en el insert**

En `server/routes/grupos.js:822-835`, dentro del objeto insertado en `grupo_gastos`, agregar el campo después de `id_categoria`:

```javascript
        const { data: gasto, error: errGasto } = await supabaseAdmin
            .from('grupo_gastos')
            .insert([{
                grupo_id:       Number(grupoId),
                descripcion:    descripcion.trim().toUpperCase(),
                monto:          montoNum,
                pagado_por:     pagadoPor,
                fecha:          `${fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })}T12:00:00-03:00`,
                nota:           nota?.trim() || null,
                id_categoria:   idCategoria || null,
                id_metodo_pago: idMetodoPago || null,
                creado_por:     user.id,
            }])
            .select()
            .single();
```

- [ ] **Step 3: Verificar manualmente**

No hay test de integración HTTP en este proyecto para las rutas de grupos (ver `server/tests/grupos.helpers.test.js` — solo helpers puros). La verificación de este endpoint se hace en Task 8 (prueba manual end-to-end desde el navegador), junto con el resto de los endpoints. No crear un test de integración HTTP nuevo acá — sería una desviación del patrón existente del proyecto.

- [ ] **Step 4: Commit**

```bash
git add server/routes/grupos.js
git commit -m "feat(grupos): persistir id_metodo_pago en POST /gastos"
```

---

### Task 3: Backend — `PUT /:grupoId/gastos/:gastoId` acepta `idMetodoPago`

**Files:**
- Modify: `server/routes/grupos.js:879-1019`

- [ ] **Step 1: Agregar `idMetodoPago` a la desestructuración del body**

En `server/routes/grupos.js:882`, reemplazar:

```javascript
    const { descripcion, monto, pagadoPor, fecha, primeraCuota, nota, idCategoria, participantesUserIds } = req.body;
```

por:

```javascript
    const { descripcion, monto, pagadoPor, fecha, primeraCuota, nota, idCategoria, idMetodoPago, participantesUserIds } = req.body;
```

- [ ] **Step 2: Persistir `id_metodo_pago` en el update**

En `server/routes/grupos.js:924-937`, agregar el campo al objeto de `update`:

```javascript
        const { data: gasto, error: errUpdate } = await supabaseAdmin
            .from('grupo_gastos')
            .update({
                descripcion:    descripcion.trim().toUpperCase(),
                monto:          montoNum,
                pagado_por:     pagadoPor,
                fecha:          `${fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })}T12:00:00-03:00`,
                nota:           nota?.trim() || null,
                id_categoria:   idCategoria || null,
                id_metodo_pago: idMetodoPago || null,
            })
            .eq('id', gastoId)
            .eq('estado', 'activo')
            .select()
            .maybeSingle();
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/grupos.js
git commit -m "feat(grupos): persistir id_metodo_pago en PUT /gastos/:gastoId"
```

---

### Task 4: Backend — `POST /:grupoId/gastos-cuotas` deriva "tarjeta" del flag `acepta_cuotas`

**Files:**
- Modify: `server/routes/grupos.js:1275-1462`

Este es el cambio central: hoy el endpoint asume que "cuotas" siempre implica tarjeta de crédito y hardcodea el string `'TARJETA DE CREDITO'`. A partir de este task, el método de pago se recibe del cliente y se valida contra `metodos_pago.acepta_cuotas` antes de crear las cuotas — igual regla que ya aplica el módulo individual (`handleCambioMetodoPago` en Dashboard.jsx).

- [ ] **Step 1: Agregar `idMetodoPago` a la desestructuración del body**

En `server/routes/grupos.js:1278-1288`, reemplazar:

```javascript
    const {
        descripcion,
        monto,
        cuotas: cuotasRaw,
        pagadoPor,
        fecha,
        primeraCuota,
        nota,
        idCategoria,
        participantesUserIds,
    } = req.body;
```

por:

```javascript
    const {
        descripcion,
        monto,
        cuotas: cuotasRaw,
        pagadoPor,
        fecha,
        primeraCuota,
        nota,
        idCategoria,
        idMetodoPago,
        participantesUserIds,
    } = req.body;
```

- [ ] **Step 2: Validar que el método de pago exista y acepte cuotas**

En `server/routes/grupos.js:1300-1309` (justo después de la validación de `participantesUserIds` y antes del bloque `uuidRegex`), agregar la validación de entrada:

```javascript
    if (!idMetodoPago) return res.status(400).json({ ok: false, error: 'El método de pago es requerido' });
```

Luego, dentro del `try` (después de la verificación de membresía en `server/routes/grupos.js:1310-1315`, antes de la verificación de participantes), agregar la consulta a `metodos_pago` para confirmar que acepta cuotas — este es el reemplazo real del string hardcodeado:

```javascript
        // El método de pago debe existir y aceptar cuotas (flag explícito, no string-match)
        const { data: metodoPago } = await supabaseAdmin
            .from('metodos_pago').select('id, acepta_cuotas')
            .eq('id', idMetodoPago).maybeSingle();
        if (!metodoPago) return res.status(400).json({ ok: false, error: 'Método de pago inválido' });
        if (!metodoPago.acepta_cuotas) return res.status(400).json({ ok: false, error: 'El método de pago seleccionado no acepta cuotas' });
```

- [ ] **Step 3: Reemplazar el string hardcodeado por `id_metodo_pago` en ambos inserts**

En `server/routes/grupos.js:1357-1374` (insert de la primera cuota), reemplazar la línea `metodo_pago: 'TARJETA DE CREDITO',` por `id_metodo_pago: idMetodoPago,`:

```javascript
        const { data: primera, error: errPrimera } = await supabaseAdmin
            .from('grupo_gastos')
            .insert([{
                grupo_id:       Number(grupoId),
                descripcion:    cuotasCalculadas[0].descripcion,
                monto:          cuotasCalculadas[0].monto,
                pagado_por:     pagadoPor,
                fecha:          cuotasCalculadas[0].fecha,
                nota:           nota?.trim() || null,
                id_categoria:   idCategoria || null,
                creado_por:     user.id,
                cuotas:         cantCuotas,
                numero_cuota:   1,
                id_gasto_padre: null, // se actualiza a continuación
                id_metodo_pago: idMetodoPago,
            }])
            .select()
            .single();
```

En `server/routes/grupos.js:1389-1402` (insert de las cuotas 2..N), reemplazar la misma línea:

```javascript
            const filasRestantes = cuotasCalculadas.slice(1).map(c => ({
                grupo_id:       Number(grupoId),
                descripcion:    c.descripcion,
                monto:          c.monto,
                pagado_por:     pagadoPor,
                fecha:          c.fecha,
                nota:           nota?.trim() || null,
                id_categoria:   idCategoria || null,
                creado_por:     user.id,
                cuotas:         cantCuotas,
                numero_cuota:   c.numero,
                id_gasto_padre: primera.id,
                id_metodo_pago: idMetodoPago,
            }));
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/grupos.js
git commit -m "feat(grupos): reemplazar string hardcodeado por flag acepta_cuotas en gastos-cuotas"
```

---

### Task 5: Cliente — `db.js` propaga `idMetodoPago` y elimina el string-match en `obtenerCuotasGrupal`

**Files:**
- Modify: `client/src/lib/db.js:1955-2048` (crearGastoGrupal, crearGastoGrupalEnCuotas)
- Modify: `client/src/lib/db.js:2058-2104` (obtenerCuotasGrupal)
- Modify: `client/src/lib/db.js` (actualizarGastoGrupal — buscar su definición, mismo patrón)
- Test: `client/src/lib/cuotasGroupHelper.test.js` (ya cubre `filtrarTarjetaCredito`, no requiere cambios — se reutiliza en el Step 2)

- [ ] **Step 1: `crearGastoGrupal` — agregar `idMetodoPago` al payload**

En `client/src/lib/db.js:1955-1985`, la firma y el body del fetch cambian así:

```javascript
export const crearGastoGrupal = async ({
    grupoId,
    descripcion,
    monto,
    pagadoPor,
    fecha,
    nota,
    idCategoria,
    idMetodoPago,
    participantesUserIds,
}) => {
    if (!grupoId) throw new Error('ID de grupo requerido');
    if (!descripcion || !descripcion.trim()) throw new Error('La descripción es requerida');
    validarMonto(monto);
    const montoNum = Number(monto);
    if (!pagadoPor) throw new Error('El pagador es requerido');
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        throw new Error('Debe haber al menos un participante');
    }

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/gastos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ descripcion, monto: montoNum, pagadoPor, fecha, nota, idCategoria, idMetodoPago, participantesUserIds }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al crear el gasto');
    return { gasto: json.gasto, participantes: json.participantes };
};
```

- [ ] **Step 2: `crearGastoGrupalEnCuotas` — agregar `idMetodoPago`, validarlo antes de llamar al backend**

Localizar la función completa (empieza en `client/src/lib/db.js:2004`). Agregar `idMetodoPago` a la firma, validar que esté presente, e incluirlo en el body del fetch:

```javascript
export const crearGastoGrupalEnCuotas = async ({
    grupoId,
    descripcion,
    monto,
    cuotas,
    pagadoPor,
    fecha,
    primeraCuota,
    nota,
    idCategoria,
    idMetodoPago,
    participantesUserIds,
}) => {
    if (!grupoId) throw new Error('ID de grupo requerido');
    if (!descripcion || !descripcion.trim()) throw new Error('La descripción es requerida');
    validarMonto(monto);
    const montoNum = Number(monto);
    const cantCuotas = Math.max(1, Math.min(18, parseInt(cuotas) || 1));
    if (!pagadoPor) throw new Error('El pagador es requerido');
    if (!primeraCuota) throw new Error('Indicá en qué mes vence la primera cuota');
    if (!idMetodoPago) throw new Error('El método de pago es requerido');
    if (!Array.isArray(participantesUserIds) || participantesUserIds.length < 1) {
        throw new Error('Debe haber al menos un participante');
    }

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/gastos-cuotas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            descripcion,
            monto: montoNum,
            cuotas: cantCuotas,
            pagadoPor,
            fecha,
            primeraCuota,
            nota,
            idCategoria,
            idMetodoPago,
            participantesUserIds,
        }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al crear el gasto en cuotas');
    return { gasto: json.gasto, gastos: json.gastos, participantes: json.participantes };
};
```

- [ ] **Step 3: Actualizar `actualizarGastoGrupal` con el mismo patrón**

En `client/src/lib/db.js:2223-2241`, la función completa hoy es:

```javascript
export const actualizarGastoGrupal = async (gastoId, { grupoId, descripcion, monto, pagadoPor, fecha, primeraCuota, idCategoria, nota, participantesUserIds }) => {
    if (!gastoId) throw new Error('ID de gasto inválido');
    if (!grupoId) throw new Error('ID de grupo inválido');
    if (!participantesUserIds?.length) throw new Error('Se requiere al menos un participante');
    validarMonto(monto);
    const montoNum = Number(monto);

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/gastos/${gastoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ descripcion, monto: montoNum, pagadoPor, fecha, primeraCuota, idCategoria, nota, participantesUserIds }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al actualizar el gasto');
    return { gasto: json.gasto, participantes: json.participantes };
};
```

Reemplazarla por (agrega `idMetodoPago` a la firma y al body del fetch, sin tocar nada más):

```javascript
export const actualizarGastoGrupal = async (gastoId, { grupoId, descripcion, monto, pagadoPor, fecha, primeraCuota, idCategoria, idMetodoPago, nota, participantesUserIds }) => {
    if (!gastoId) throw new Error('ID de gasto inválido');
    if (!grupoId) throw new Error('ID de grupo inválido');
    if (!participantesUserIds?.length) throw new Error('Se requiere al menos un participante');
    validarMonto(monto);
    const montoNum = Number(monto);

    const token = await obtenerTokenActivo();

    const res = await fetch(`${BACKEND_URL}/api/grupos/${grupoId}/gastos/${gastoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ descripcion, monto: montoNum, pagadoPor, fecha, primeraCuota, idCategoria, idMetodoPago, nota, participantesUserIds }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al actualizar el gasto');
    return { gasto: json.gasto, participantes: json.participantes };
};
```

- [ ] **Step 4: `obtenerCuotasGrupal` — reemplazar filtro por string con filtro por flag**

En `client/src/lib/db.js:2058-2073`, reemplazar el `.select(...)` y el `.eq('metodo_pago', ...)` por un join a `metodos_pago` y el filtro `filtrarTarjetaCredito` ya existente en `cuotasGroupHelper.js`:

```javascript
import { filtrarTarjetaCredito } from './cuotasGroupHelper';
// (agregar este import junto a los demás imports de cuotasGroupHelper si ya existen en el archivo — revisar el encabezado de db.js antes de duplicar el import)
```

```javascript
export const obtenerCuotasGrupal = async (grupoId) => {
    if (!grupoId) throw new Error('ID de grupo inválido');

    const { data, error } = await supabase
        .from('grupo_gastos')
        .select('id, descripcion, monto, fecha, cuotas, numero_cuota, id_gasto_padre, estado, pagado_por, metodos_pago:id_metodo_pago(acepta_cuotas)')
        .eq('grupo_id', grupoId)
        .eq('estado', 'activo')
        .not('id_gasto_padre', 'is', null)
        .order('id_gasto_padre', { ascending: true })
        .order('numero_cuota', { ascending: true });

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return [];

    const soloTarjeta = filtrarTarjetaCredito(data);
    if (soloTarjeta.length === 0) return [];

    // Agrupar por id_gasto_padre
    const grupos = new Map();
    for (const cuota of soloTarjeta) {
        const padreId = cuota.id_gasto_padre;
        if (!grupos.has(padreId)) grupos.set(padreId, []);
        grupos.get(padreId).push(cuota);
    }

    const hoy = new Date().toISOString().split('T')[0];

    return Array.from(grupos.values()).map(cuotasList => {
        const primera = cuotasList[0];
        const descripcionBase = primera.descripcion.replace(/\s*\(\d+\/\d+\)$/, '');
        const totalOriginal = cuotasList.reduce((sum, c) => sum + Number(c.monto), 0);
        const pagadas  = cuotasList.filter(c => c.fecha <= hoy).length;
        const pendientes = cuotasList.filter(c => c.fecha > hoy).length;

        return {
            id:             primera.id_gasto_padre,
            descripcionBase,
            totalOriginal:  Math.round(totalOriginal * 100) / 100,
            cuotas:         primera.cuotas,
            pagadas,
            pendientes,
            montoMensual:   primera.monto,
            pagadoPor:      primera.pagado_por,
            cuotasList,
        };
    });
};
```

Nota: `filtrarTarjetaCredito` (client/src/lib/cuotasGroupHelper.js:28-30) ya filtra por `g.metodos_pago?.acepta_cuotas === true` — es exactamente el shape que produce el alias `metodos_pago:id_metodo_pago(acepta_cuotas)` de Supabase. No dupliques esa lógica de filtrado inline.

- [ ] **Step 5: Verificar que los tests existentes de `cuotasGroupHelper.test.js` siguen pasando**

Ese archivo testea `filtrarTarjetaCredito` de forma aislada (no llama a `obtenerCuotasGrupal`), así que no debería romperse, pero confirmar:

```bash
cd client && npx vitest run src/lib/cuotasGroupHelper.test.js
```

Expected: todos los tests en verde (ya existían antes de este task, no se tocó el archivo).

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/db.js
git commit -m "feat(grupos): propagar idMetodoPago y reemplazar string-match en obtenerCuotasGrupal"
```

---

### Task 6: Frontend — `GrupoGastoNuevo.jsx` con `ChipSelector` + flag `acepta_cuotas` + fase guardando/resultado

**Files:**
- Modify: `client/src/pages/grupos/GrupoGastoNuevo.jsx`
- Test: `client/src/pages/grupos/GrupoGastoNuevo.test.jsx` (nuevo)

Este task reemplaza: el `<select>` de categoría por `ChipSelector`, agrega un `ChipSelector` de método de pago, deriva `esTarjeta` del flag `acepta_cuotas` (elimina el checkbox manual "Pagado con tarjeta de crédito"), y agrega las fases `guardando`/`resultado` con spinner (mismo patrón visual que `Dashboard.jsx:1033-1064`).

- [ ] **Step 1: Escribir el test que fija el comportamiento nuevo antes de tocar el componente**

Crear `client/src/pages/grupos/GrupoGastoNuevo.test.jsx`. Revisar primero si existe un patrón de mocks para `db` y `react-router-dom` en otro test de página de este proyecto (`client/src/components/ChipSelector.test.jsx` y `client/src/components/ResultModal.test.jsx` ya están en el repo — mirar sus mocks de `vi.mock` como referencia de estilo antes de escribir este archivo). El test cubre lo esencial del cambio, no reescribe toda la página:

```javascript
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GrupoGastoNuevo from './GrupoGastoNuevo';
import { AuthContext } from '../../context/AuthContext';
import * as db from '../../lib/db';

vi.mock('../../lib/db');

const MIEMBROS = [
    { user_id: 'u1', estado: 'activo', alias: 'Nico' },
    { user_id: 'u2', estado: 'activo', alias: 'Ana' },
];
const CATEGORIAS = [
    { id: 1, nombre: 'COMIDA', icono: 'restaurant', es_propia: false },
];
const METODOS_PAGO = [
    { id: 10, nombre: 'EFECTIVO', icono: 'payments', acepta_cuotas: false },
    { id: 20, nombre: 'VISA', icono: 'credit_card', acepta_cuotas: true },
];

function renderPagina() {
    return render(
        <AuthContext.Provider value={{ user: { id: 'u1' } }}>
            <MemoryRouter initialEntries={['/grupos/1/gastos/nuevo']}>
                <Routes>
                    <Route path="/grupos/:id/gastos/nuevo" element={<GrupoGastoNuevo />} />
                </Routes>
            </MemoryRouter>
        </AuthContext.Provider>
    );
}

describe('GrupoGastoNuevo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.obtenerMiembrosDelGrupo.mockResolvedValue(MIEMBROS);
        db.getCategories.mockResolvedValue(CATEGORIAS);
        db.getPaymentMethods.mockResolvedValue(METODOS_PAGO);
        db.crearGastoGrupal.mockResolvedValue({ gasto: { id: 1 }, participantes: [] });
        db.crearGastoGrupalEnCuotas.mockResolvedValue({ gasto: { id: 1 }, gastos: [], participantes: [] });
    });

    it('muestra chips de categoría y método de pago en vez de selects nativos', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('COMIDA')).toBeInTheDocument());
        expect(screen.getByText('EFECTIVO')).toBeInTheDocument();
        expect(screen.getByText('VISA')).toBeInTheDocument();
        expect(screen.queryByLabelText(/Categoría/i)?.tagName).not.toBe('SELECT');
    });

    it('al elegir un método que acepta cuotas, muestra selector de cuotas y mes de primera cuota', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('VISA')).toBeInTheDocument());
        fireEvent.click(screen.getByText('VISA'));
        expect(await screen.findByLabelText(/Cuotas/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/primera cuota/i)).toBeInTheDocument();
    });

    it('al elegir un método que NO acepta cuotas, no muestra selector de cuotas', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('EFECTIVO')).toBeInTheDocument());
        fireEvent.click(screen.getByText('EFECTIVO'));
        expect(screen.queryByLabelText(/Cuotas/i)).not.toBeInTheDocument();
    });

    it('muestra fase "guardando" al enviar el formulario y fase "resultado" al terminar', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('COMIDA')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText(/Descripción/i), { target: { value: 'Cena' } });
        fireEvent.change(screen.getByLabelText(/Monto/i), { target: { value: '1000' } });
        fireEvent.click(screen.getByText('COMIDA'));
        fireEvent.click(screen.getByText('EFECTIVO'));
        fireEvent.change(screen.getByLabelText(/Pagó/i), { target: { value: 'u1' } });

        fireEvent.click(screen.getByRole('button', { name: /Guardar gasto/i }));

        expect(await screen.findByText(/¡Gasto registrado!|Gasto registrado/i)).toBeInTheDocument();
        expect(db.crearGastoGrupal).toHaveBeenCalledWith(expect.objectContaining({ idMetodoPago: 10 }));
    });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

```bash
cd client && npx vitest run src/pages/grupos/GrupoGastoNuevo.test.jsx
```

Expected: FAIL — el componente actual usa `<select>` para categoría, no tiene chips de método de pago, ni fases `guardando`/`resultado`.

- [ ] **Step 3: Reescribir `GrupoGastoNuevo.jsx`**

Reemplazar el contenido completo de `client/src/pages/grupos/GrupoGastoNuevo.jsx`:

```jsx
import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CurrencyInput from '../../components/CurrencyInput';
import ChipSelector from '../../components/ChipSelector';
import MiembrosSelector from '../../components/grupos/MiembrosSelector';
import { AuthContext } from '../../context/AuthContext';
import * as db from '../../lib/db';
import { fechaHoyArgentina } from '../../utils/format';
import { calcularDivisionIgualitaria } from '../../lib/cuotasHelper';

// Opciones estáticas de cuotas — igual límite que el módulo individual (Dashboard.jsx)
const OPCIONES_CUOTAS = Array.from({ length: 18 }, (_, i) => i + 1);

/**
 * Página para registrar un nuevo gasto dentro de un grupo de gastos compartidos.
 * Carga los miembros activos del grupo, muestra un formulario completo
 * y calcula en tiempo real cuánto le corresponde a cada participante.
 *
 * Ruta: /grupos/:id/gastos/nuevo
 */
const GrupoGastoNuevo = () => {
    const { id: grupoId } = useParams();
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);

    // Estado de datos del grupo
    const [miembros, setMiembros] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [metodosPago, setMetodosPago] = useState([]);
    const [cargandoMiembros, setCargandoMiembros] = useState(true);
    const [errorCarga, setErrorCarga] = useState(null);

    // Estado del formulario
    const [descripcion, setDescripcion] = useState('');
    const [monto, setMonto] = useState(0);
    const [fecha, setFecha] = useState(() => fechaHoyArgentina());
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

    // Carga los miembros activos del grupo, categorías y métodos de pago al montar
    const cargarMiembros = useCallback(async () => {
        if (!grupoId) return;
        try {
            setCargandoMiembros(true);
            setErrorCarga(null);
            const [datosMiembros, datosCategorias, datosMetodos] = await Promise.all([
                db.obtenerMiembrosDelGrupo(grupoId),
                db.getCategories(),
                db.getPaymentMethods(),
            ]);

            const activos = (datosMiembros || []).filter((m) => m.estado === 'activo');
            setMiembros(activos);
            setCategorias((datosCategorias || []).filter((categoria) => !categoria.es_propia));
            setMetodosPago(datosMetodos || []);
            // Por defecto, el pagador es el usuario actual
            if (user?.id) setPagadoPor(user.id);
            // Por defecto, todos los miembros activos son participantes
            setParticipantes(activos.map((m) => m.user_id));
        } catch (err) {
            console.error('Error al cargar miembros:', err);
            setErrorCarga('No se pudieron cargar los miembros del grupo.');
        } finally {
            setCargandoMiembros(false);
        }
    }, [grupoId, user?.id]);

    useEffect(() => {
        cargarMiembros();
    }, [cargarMiembros]);

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

    // Formatea monto en estilo argentino
    const formatearMonto = (val) =>
        `$ ${Number(val).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;

    // Validación y envío del formulario
    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorGuardado(null);

        // Validaciones client-side
        if (!descripcion.trim()) {
            setErrorGuardado('La descripción es obligatoria.');
            return;
        }
        if (!monto || monto <= 0) {
            setErrorGuardado('El monto debe ser mayor a cero.');
            return;
        }
        if (participantes.length === 0) {
            setErrorGuardado('Seleccioná al menos un participante.');
            return;
        }
        if (!pagadoPor) {
            setErrorGuardado('Seleccioná quién pagó.');
            return;
        }
        if (!metodoPagoId) {
            setErrorGuardado('Seleccioná un método de pago.');
            return;
        }
        if (esTarjeta && !primeraCuota) {
            setErrorGuardado('Indicá en qué mes vence la primera cuota.');
            return;
        }

        setFase('guardando');

        try {
            const params = {
                grupoId: Number(grupoId),
                descripcion,
                monto,
                pagadoPor,
                fecha,
                idCategoria: categoriaId ? Number(categoriaId) : undefined,
                idMetodoPago: Number(metodoPagoId),
                nota: nota || undefined,
                participantesUserIds: participantes,
            };

            if (esTarjeta) {
                await db.crearGastoGrupalEnCuotas({ ...params, cuotas, primeraCuota });
            } else {
                await db.crearGastoGrupal(params);
            }
            setResultado({ tipo: 'success', titulo: '¡Gasto registrado!' });
            setFase('resultado');
        } catch (err) {
            console.error('Error al guardar el gasto:', err);
            setResultado({ tipo: 'error', titulo: 'No se pudo registrar el gasto', mensaje: err.message });
            setFase('resultado');
        }
    };

    /** Vuelve al detalle del grupo tras ver el resultado (éxito o error). */
    const handleContinuar = () => {
        if (resultado?.tipo === 'success') {
            navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } });
        } else {
            setFase('form');
            setResultado(null);
        }
    };

    // ── Estado de carga ──
    if (cargandoMiembros) {
        return (
            <div className="grupos-page">
                <div className="grupos-page__loading">
                    <div className="loading-spinner" />
                    <p>Cargando datos del grupo...</p>
                </div>
            </div>
        );
    }

    // ── Error al cargar ──
    if (errorCarga) {
        return (
            <div className="grupos-page">
                <div className="grupos-page__header">
                    <button className="btn btn-ghost" onClick={() => navigate(`/grupos/${grupoId}`)}>
                        <span className="material-symbols-outlined">arrow_back</span>
                        Volver
                    </button>
                </div>
                <div className="grupos-page__error">
                    <span className="material-symbols-outlined">error_outline</span>
                    {errorCarga}
                </div>
            </div>
        );
    }

    // ── Fase guardando: spinner ──
    if (fase === 'guardando') {
        return (
            <div className="grupos-page">
                <div className="result-modal" role="status" aria-live="polite">
                    <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                        progress_activity
                    </span>
                    <h3 className="result-modal__titulo">Guardando gasto...</h3>
                </div>
            </div>
        );
    }

    // ── Fase resultado: éxito o error ──
    if (fase === 'resultado' && resultado) {
        return (
            <div className="grupos-page">
                <div className="result-modal">
                    <span
                        className="material-symbols-outlined result-modal__icono"
                        style={{
                            color: resultado.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                            borderColor: resultado.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                        }}
                    >
                        {resultado.tipo === 'error' ? 'cancel' : 'check_circle'}
                    </span>
                    <h3 className="result-modal__titulo">{resultado.titulo}</h3>
                    {resultado.mensaje && (
                        <p className="result-modal__subtexto">{resultado.mensaje}</p>
                    )}
                    <button
                        type="button"
                        className={`btn result-modal__boton result-modal__boton--${resultado.tipo === 'error' ? 'error' : 'success'}`}
                        onClick={handleContinuar}
                    >
                        Continuar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="grupos-page">
            {/* Encabezado */}
            <div className="grupos-page__header">
                <button
                    className="btn btn-ghost"
                    onClick={() => navigate(`/grupos/${grupoId}`)}
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                    Volver
                </button>
                <h1 className="grupos-page__titulo">Cargar gasto</h1>
            </div>

            {/* Banner de error al guardar */}
            {errorGuardado && (
                <div className="grupos-page__error-banner">
                    <span className="material-symbols-outlined">error_outline</span>
                    {errorGuardado}
                </div>
            )}

            <form onSubmit={handleSubmit} className="glass-card grupo-gasto-nuevo__form">

                {/* Campo: Descripción */}
                <div className="form-group">
                    <label className="form-label" htmlFor="descripcion">
                        Descripción <span className="form-label__required">*</span>
                    </label>
                    <input
                        id="descripcion"
                        type="text"
                        className="input"
                        placeholder="Ej: Cena del viernes"
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        maxLength={200}
                        required
                        autoFocus
                    />
                </div>

                {/* Campo: Monto */}
                <div className="form-group">
                    <label className="form-label" htmlFor="monto">
                        Monto <span className="form-label__required">*</span>
                    </label>
                    <CurrencyInput
                        value={monto}
                        onChange={setMonto}
                        placeholder="0,00"
                        className="input"
                        required
                    />
                </div>

                {/* Campo: Fecha */}
                <div className="form-group">
                    <label className="form-label" htmlFor="fecha">
                        Fecha <span className="form-label__required">*</span>
                    </label>
                    <input
                        id="fecha"
                        type="date"
                        className="input"
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        required
                    />
                </div>

                {/* Campo: Categoría opcional */}
                <div className="form-group">
                    <label className="form-label">
                        Categoría <span className="form-label__opcional">(opcional)</span>
                    </label>
                    <ChipSelector
                        opciones={categorias}
                        valorSeleccionado={categoriaId ? Number(categoriaId) : null}
                        onChange={(id) => setCategoriaId(id)}
                        limiteVisible={6}
                    />
                </div>

                {/* Campo: Método de pago */}
                <div className="form-group">
                    <label className="form-label">
                        Método de Pago <span className="form-label__required">*</span>
                    </label>
                    <ChipSelector
                        opciones={metodosPago}
                        valorSeleccionado={metodoPagoId ? Number(metodoPagoId) : null}
                        onChange={(id) => handleCambioMetodoPago(id)}
                        limiteVisible={6}
                    />
                </div>

                {/* Selector de cuotas y mes primera cuota — solo si el método acepta cuotas */}
                {esTarjeta && (
                    <>
                    <div className="form-group">
                        <label className="form-label" htmlFor="cuotas">
                            Cuotas <span className="form-label__required">*</span>
                        </label>
                        <select
                            id="cuotas"
                            className="input"
                            value={cuotas}
                            onChange={(e) => setCuotas(parseInt(e.target.value))}
                        >
                            {OPCIONES_CUOTAS.map(n => (
                                <option key={n} value={n}>
                                    {n === 1 ? '1 cuota (pago único)' : `${n} cuotas`}
                                </option>
                            ))}
                        </select>
                        <small className="form-hint">
                            Cada cuota se divide igualitariamente entre los participantes.
                        </small>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="primera-cuota">
                            Mes de la primera cuota <span className="form-label__required">*</span>
                        </label>
                        <input
                            id="primera-cuota"
                            type="month"
                            className="input"
                            value={primeraCuota}
                            onChange={(e) => setPrimeraCuota(e.target.value)}
                            required
                        />
                        <small className="form-hint">
                            El 1° del mes elegido se usa como fecha de vencimiento de la primera cuota.
                        </small>
                    </div>
                    </>
                )}

                {/* Campo: Pagado por */}
                <div className="form-group">
                    <label className="form-label" htmlFor="pagado-por">
                        Pagó <span className="form-label__required">*</span>
                    </label>
                    <select
                        id="pagado-por"
                        className="input"
                        value={pagadoPor}
                        onChange={(e) => setPagadoPor(e.target.value)}
                        required
                    >
                        <option value="">Seleccioná quién pagó...</option>
                        {miembros.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                                {m.alias || m.nombre || 'Usuario sin nombre'}
                                {m.user_id === user?.id ? ' (vos)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Campo: Participantes */}
                <div className="form-group">
                    <label className="form-label">
                        Participantes <span className="form-label__required">*</span>
                    </label>
                    <MiembrosSelector
                        miembros={miembros}
                        seleccionados={participantes}
                        onChange={setParticipantes}
                    />
                    {participantes.length === 0 && (
                        <p className="form-hint form-hint--error">
                            Seleccioná al menos un participante.
                        </p>
                    )}
                </div>

                {/* Preview de división igualitaria */}
                {divisionPreview && (
                    <div className="grupo-gasto-nuevo__preview">
                        <span className="material-symbols-outlined grupo-gasto-nuevo__preview-icon">
                            calculate
                        </span>
                        <div>
                            {divisionPreview.esTarjeta ? (
                                <>
                                    <p className="grupo-gasto-nuevo__preview-texto">
                                        Cada uno paga:{' '}
                                        <strong>{formatearMonto(divisionPreview.montoPorPersona)}</strong>
                                        {' '}por mes durante{' '}
                                        <strong>{divisionPreview.cuotas} cuotas</strong>
                                        {' '}({divisionPreview.participantes} participante{divisionPreview.participantes !== 1 ? 's' : ''})
                                    </p>
                                    <p className="grupo-gasto-nuevo__preview-nota">
                                        Total a dividir por cuota: {formatearMonto(divisionPreview.montoCuota)}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="grupo-gasto-nuevo__preview-texto">
                                        Cada uno paga:{' '}
                                        <strong>{formatearMonto(divisionPreview.base)}</strong>
                                        {' '}({participantes.length} participante{participantes.length !== 1 ? 's' : ''})
                                    </p>
                                    {divisionPreview.tieneDiferencia && (
                                        <p className="grupo-gasto-nuevo__preview-nota">
                                            El pagador absorbe {formatearMonto(divisionPreview.diferencia)} de diferencia por redondeo.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Campo: Nota (opcional) */}
                <div className="form-group">
                    <label className="form-label" htmlFor="nota">
                        Nota <span className="form-label__opcional">(opcional)</span>
                    </label>
                    <textarea
                        id="nota"
                        className="input"
                        placeholder="Detalles adicionales..."
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        rows={3}
                        maxLength={500}
                    />
                </div>

                {/* Acciones */}
                <div className="grupo-gasto-nuevo__actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(`/grupos/${grupoId}`)}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={participantes.length === 0 || !monto || monto <= 0}
                    >
                        <span className="material-symbols-outlined">save</span>
                        Guardar gasto
                    </button>
                </div>
            </form>
        </div>
    );
};

export default GrupoGastoNuevo;
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

```bash
cd client && npx vitest run src/pages/grupos/GrupoGastoNuevo.test.jsx
```

Expected: PASS (los 4 tests en verde).

- [ ] **Step 5: Lint y build**

```bash
npm --prefix client run lint && npm --prefix client run build
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/grupos/GrupoGastoNuevo.jsx client/src/pages/grupos/GrupoGastoNuevo.test.jsx
git commit -m "feat(grupos): ChipSelector + flag acepta_cuotas + fase guardando/resultado en alta de gasto grupal"
```

---

### Task 7: Frontend — `GrupoGastoEditar.jsx` con el mismo patrón

**Files:**
- Modify: `client/src/pages/grupos/GrupoGastoEditar.jsx`
- Test: `client/src/pages/grupos/GrupoGastoEditar.test.jsx` (nuevo)

Mismo cambio que Task 6, aplicado a la edición. Diferencias clave respecto a `GrupoGastoNuevo`: carga datos existentes del gasto (incluyendo `id_metodo_pago`), usa `actualizarGastoGrupal` en vez de crear, y ya tenía lógica de `esCuotas`/`primeraCuota` basada en `(gastoExistente.cuotas || 1) > 1` — esa detección de "es cuotas" para poblar el campo de fecha de la primera cuota se mantiene igual (no depende de método de pago), pero ahora además hay que popular `metodoPagoId` desde `gastoExistente.id_metodo_pago` y el flag `esTarjeta` se deriva de `metodosPago` igual que en Nuevo.

- [ ] **Step 1: Escribir el test que fija el comportamiento nuevo antes de tocar el componente**

Crear `client/src/pages/grupos/GrupoGastoEditar.test.jsx`:

```javascript
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GrupoGastoEditar from './GrupoGastoEditar';
import { AuthContext } from '../../context/AuthContext';
import * as db from '../../lib/db';

vi.mock('../../lib/db');

const MIEMBROS = [
    { user_id: 'u1', estado: 'activo', alias: 'Nico' },
    { user_id: 'u2', estado: 'activo', alias: 'Ana' },
];
const CATEGORIAS = [
    { id: 1, nombre: 'COMIDA', icono: 'restaurant', es_propia: false },
];
const METODOS_PAGO = [
    { id: 10, nombre: 'EFECTIVO', icono: 'payments', acepta_cuotas: false },
    { id: 20, nombre: 'VISA', icono: 'credit_card', acepta_cuotas: true },
];
const GASTO_EXISTENTE = {
    id: 5,
    descripcion: 'CENA',
    monto: 1000,
    fecha: '2026-07-01T12:00:00-03:00',
    id_categoria: 1,
    id_metodo_pago: 10,
    pagado_por: 'u1',
    nota: '',
    cuotas: 1,
    participantes: [{ user_id: 'u1' }, { user_id: 'u2' }],
};

function renderPagina() {
    return render(
        <AuthContext.Provider value={{ user: { id: 'u1' } }}>
            <MemoryRouter initialEntries={['/grupos/1/gastos/5/editar']}>
                <Routes>
                    <Route path="/grupos/:id/gastos/:gastoId/editar" element={<GrupoGastoEditar />} />
                </Routes>
            </MemoryRouter>
        </AuthContext.Provider>
    );
}

describe('GrupoGastoEditar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.obtenerMiembrosDelGrupo.mockResolvedValue(MIEMBROS);
        db.getCategories.mockResolvedValue(CATEGORIAS);
        db.getPaymentMethods.mockResolvedValue(METODOS_PAGO);
        db.obtenerGastoConParticipantes.mockResolvedValue(GASTO_EXISTENTE);
        db.actualizarGastoGrupal.mockResolvedValue({ gasto: { id: 5 }, participantes: [] });
    });

    it('precarga el chip de método de pago activo desde el gasto existente', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('EFECTIVO')).toBeInTheDocument());
        const chipEfectivo = screen.getByText('EFECTIVO').closest('button');
        expect(chipEfectivo.className).toContain('chip-selector__chip--activo');
    });

    it('al cambiar a un método que acepta cuotas, muestra selector de cuotas', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('VISA')).toBeInTheDocument());
        fireEvent.click(screen.getByText('VISA'));
        expect(await screen.findByLabelText(/Cuotas/i)).toBeInTheDocument();
    });

    it('envía idMetodoPago al guardar cambios', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('EFECTIVO')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
        await waitFor(() => expect(db.actualizarGastoGrupal).toHaveBeenCalled());
        expect(db.actualizarGastoGrupal).toHaveBeenCalledWith(
            '5',
            expect.objectContaining({ idMetodoPago: 10 })
        );
    });

    it('muestra fase de resultado tras guardar exitosamente', async () => {
        renderPagina();
        await waitFor(() => expect(screen.getByText('EFECTIVO')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));
        expect(await screen.findByText(/actualizado/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

```bash
cd client && npx vitest run src/pages/grupos/GrupoGastoEditar.test.jsx
```

Expected: FAIL — el componente actual no tiene `ChipSelector` de método de pago ni fases `guardando`/`resultado`.

- [ ] **Step 3: Reescribir `GrupoGastoEditar.jsx`**

Reemplazar el contenido completo de `client/src/pages/grupos/GrupoGastoEditar.jsx`:

```jsx
import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CurrencyInput from '../../components/CurrencyInput';
import ChipSelector from '../../components/ChipSelector';
import MiembrosSelector from '../../components/grupos/MiembrosSelector';
import { AuthContext } from '../../context/AuthContext';
import * as db from '../../lib/db';
import { fechaHoyArgentina } from '../../utils/format';

const OPCIONES_CUOTAS = Array.from({ length: 18 }, (_, i) => i + 1);

/**
 * Página para editar un gasto grupal existente.
 * Carga el gasto con sus participantes actuales y permite modificar todos los campos.
 *
 * Ruta: /grupos/:id/gastos/:gastoId/editar
 */
const GrupoGastoEditar = () => {
    const { id: grupoId, gastoId } = useParams();
    const navigate = useNavigate();
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
    const [fecha, setFecha] = useState('');
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
    const [fase, setFase] = useState('form');
    const [resultado, setResultado] = useState(null);

    // Carga el gasto existente, miembros, categorías y métodos de pago al montar
    const cargarDatos = useCallback(async () => {
        if (!grupoId || !gastoId) return;
        try {
            setCargando(true);
            setErrorCarga(null);

            const [datosMiembros, datosCategorias, datosMetodos, gastoExistente] = await Promise.all([
                db.obtenerMiembrosDelGrupo(grupoId),
                db.getCategories(),
                db.getPaymentMethods(),
                db.obtenerGastoConParticipantes(gastoId),
            ]);

            const activos = (datosMiembros || []).filter((m) => m.estado === 'activo');
            setMiembros(activos);
            setCategorias((datosCategorias || []).filter((c) => !c.es_propia));
            setMetodosPago(datosMetodos || []);

            // Poblar formulario con los datos del gasto
            setDescripcion(gastoExistente.descripcion || '');
            setMonto(Number(gastoExistente.monto) || 0);
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

            // Si es compra en cuotas, cargar el mes de la primera cuota (YYYY-MM)
            const esCuotasGasto = (gastoExistente.cuotas || 1) > 1;
            if (esCuotasGasto && gastoExistente.fecha) {
                setPrimeraCuota(gastoExistente.fecha.slice(0, 7));
            }
        } catch (err) {
            console.error('Error al cargar el gasto:', err);
            setErrorCarga('No se pudo cargar el gasto. Verificá que exista o que tengas permisos.');
        } finally {
            setCargando(false);
        }
    }, [grupoId, gastoId]);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    // Detecta si el método de pago seleccionado acepta cuotas (flag explícito),
    // igual criterio que en GrupoGastoNuevo.jsx y Dashboard.jsx.
    const handleCambioMetodoPago = (id) => {
        const metodo = metodosPago.find(pm => pm.id === Number(id) || pm.id === id);
        const aceptaCuotas = metodo?.acepta_cuotas === true;
        setMetodoPagoId(id);
        setEsTarjeta(aceptaCuotas);
        if (!aceptaCuotas) { setCuotas(1); setPrimeraCuota(''); }
    };

    // Calcula cuánto le toca a cada participante
    const calcularPorParticipante = () => {
        const n = participantes.length;
        if (!n || !monto || monto <= 0) return null;
        const base = Math.floor((monto / n) * 100) / 100;
        const diferencia = Math.round((monto - base * n) * 100) / 100;
        return { base, diferencia, tieneDiferencia: diferencia > 0 };
    };

    const divisionPreview = calcularPorParticipante();

    const formatearMonto = (val) =>
        `$ ${Number(val).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorGuardado(null);

        if (!descripcion.trim()) {
            setErrorGuardado('La descripción es obligatoria.');
            return;
        }
        if (!monto || monto <= 0) {
            setErrorGuardado('El monto debe ser mayor a cero.');
            return;
        }
        if (participantes.length === 0) {
            setErrorGuardado('Seleccioná al menos un participante.');
            return;
        }
        if (!pagadoPor) {
            setErrorGuardado('Seleccioná quién pagó.');
            return;
        }
        if (!metodoPagoId) {
            setErrorGuardado('Seleccioná un método de pago.');
            return;
        }
        if (esTarjeta && !primeraCuota) {
            setErrorGuardado('Indicá en qué mes vence la primera cuota.');
            return;
        }

        setFase('guardando');

        try {
            await db.actualizarGastoGrupal(gastoId, {
                grupoId,
                descripcion,
                monto,
                pagadoPor,
                fecha,
                primeraCuota: esTarjeta ? primeraCuota : undefined,
                idCategoria: categoriaId ? Number(categoriaId) : undefined,
                idMetodoPago: Number(metodoPagoId),
                nota: nota || undefined,
                participantesUserIds: participantes,
            });
            setResultado({ tipo: 'success', titulo: 'Gasto actualizado' });
            setFase('resultado');
        } catch (err) {
            console.error('Error al actualizar el gasto:', err);
            setResultado({ tipo: 'error', titulo: 'No se pudo actualizar el gasto', mensaje: err.message });
            setFase('resultado');
        }
    };

    /** Vuelve al detalle del grupo tras ver el resultado (éxito o error). */
    const handleContinuar = () => {
        if (resultado?.tipo === 'success') {
            navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } });
        } else {
            setFase('form');
            setResultado(null);
        }
    };

    // ── Estado de carga ──
    if (cargando) {
        return (
            <div className="grupos-page">
                <div className="grupos-page__loading">
                    <div className="loading-spinner" />
                    <p>Cargando gasto...</p>
                </div>
            </div>
        );
    }

    // ── Error al cargar ──
    if (errorCarga) {
        return (
            <div className="grupos-page">
                <div className="grupos-page__header">
                    <button className="btn btn-ghost" onClick={() => navigate(`/grupos/${grupoId}`)}>
                        <span className="material-symbols-outlined">arrow_back</span>
                        Volver
                    </button>
                </div>
                <div className="grupos-page__error">
                    <span className="material-symbols-outlined">error_outline</span>
                    {errorCarga}
                </div>
            </div>
        );
    }

    // ── Fase guardando: spinner ──
    if (fase === 'guardando') {
        return (
            <div className="grupos-page">
                <div className="result-modal" role="status" aria-live="polite">
                    <span className="material-symbols-outlined result-modal__icono result-modal__icono--loading" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
                        progress_activity
                    </span>
                    <h3 className="result-modal__titulo">Guardando cambios...</h3>
                </div>
            </div>
        );
    }

    // ── Fase resultado: éxito o error ──
    if (fase === 'resultado' && resultado) {
        return (
            <div className="grupos-page">
                <div className="result-modal">
                    <span
                        className="material-symbols-outlined result-modal__icono"
                        style={{
                            color: resultado.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                            borderColor: resultado.tipo === 'error' ? 'var(--danger)' : 'var(--success)',
                        }}
                    >
                        {resultado.tipo === 'error' ? 'cancel' : 'check_circle'}
                    </span>
                    <h3 className="result-modal__titulo">{resultado.titulo}</h3>
                    {resultado.mensaje && (
                        <p className="result-modal__subtexto">{resultado.mensaje}</p>
                    )}
                    <button
                        type="button"
                        className={`btn result-modal__boton result-modal__boton--${resultado.tipo === 'error' ? 'error' : 'success'}`}
                        onClick={handleContinuar}
                    >
                        Continuar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="grupos-page">
            {/* Encabezado */}
            <div className="grupos-page__header">
                <button
                    className="btn btn-ghost"
                    onClick={() => navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } })}
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                    Volver
                </button>
                <h1 className="grupos-page__titulo">Editar gasto</h1>
            </div>

            {/* Banner de error al guardar */}
            {errorGuardado && (
                <div className="grupos-page__error-banner">
                    <span className="material-symbols-outlined">error_outline</span>
                    {errorGuardado}
                </div>
            )}

            <form onSubmit={handleSubmit} className="glass-card grupo-gasto-nuevo__form">

                {/* Campo: Descripción */}
                <div className="form-group">
                    <label className="form-label" htmlFor="descripcion">
                        Descripción <span className="form-label__required">*</span>
                    </label>
                    <input
                        id="descripcion"
                        type="text"
                        className="input"
                        placeholder="Ej: Cena del viernes"
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        maxLength={200}
                        required
                        autoFocus
                    />
                </div>

                {/* Campo: Monto */}
                <div className="form-group">
                    <label className="form-label" htmlFor="monto">
                        Monto <span className="form-label__required">*</span>
                    </label>
                    <CurrencyInput
                        value={monto}
                        onChange={setMonto}
                        placeholder="0,00"
                        className="input"
                        required
                    />
                </div>

                {/* Campo: Fecha */}
                <div className="form-group">
                    <label className="form-label" htmlFor="fecha">
                        Fecha <span className="form-label__required">*</span>
                    </label>
                    <input
                        id="fecha"
                        type="date"
                        className="input"
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        required
                    />
                </div>

                {/* Campo: Categoría opcional */}
                <div className="form-group">
                    <label className="form-label">
                        Categoría <span className="form-label__opcional">(opcional)</span>
                    </label>
                    <ChipSelector
                        opciones={categorias}
                        valorSeleccionado={categoriaId ? Number(categoriaId) : null}
                        onChange={(id) => setCategoriaId(id)}
                        limiteVisible={6}
                    />
                </div>

                {/* Campo: Método de pago */}
                <div className="form-group">
                    <label className="form-label">
                        Método de Pago <span className="form-label__required">*</span>
                    </label>
                    <ChipSelector
                        opciones={metodosPago}
                        valorSeleccionado={metodoPagoId ? Number(metodoPagoId) : null}
                        onChange={(id) => handleCambioMetodoPago(id)}
                        limiteVisible={6}
                    />
                </div>

                {/* Mes primera cuota — solo si el método acepta cuotas */}
                {esTarjeta && (
                    <>
                    <div className="form-group">
                        <label className="form-label" htmlFor="cuotas">
                            Cuotas <span className="form-label__required">*</span>
                        </label>
                        <select
                            id="cuotas"
                            className="input"
                            value={cuotas}
                            onChange={(e) => setCuotas(parseInt(e.target.value))}
                        >
                            {OPCIONES_CUOTAS.map(n => (
                                <option key={n} value={n}>
                                    {n === 1 ? '1 cuota (pago único)' : `${n} cuotas`}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="primera-cuota">
                            Mes de la primera cuota <span className="form-label__required">*</span>
                        </label>
                        <input
                            id="primera-cuota"
                            type="month"
                            className="input"
                            value={primeraCuota}
                            onChange={(e) => setPrimeraCuota(e.target.value)}
                            required
                        />
                        <small className="form-hint">
                            El 1° del mes elegido se usa como fecha de vencimiento de la primera cuota.
                        </small>
                    </div>
                    </>
                )}

                {/* Campo: Pagado por */}
                <div className="form-group">
                    <label className="form-label" htmlFor="pagado-por">
                        Pagó <span className="form-label__required">*</span>
                    </label>
                    <select
                        id="pagado-por"
                        className="input"
                        value={pagadoPor}
                        onChange={(e) => setPagadoPor(e.target.value)}
                        required
                    >
                        <option value="">Seleccioná quién pagó...</option>
                        {miembros.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                                {m.alias || m.nombre || 'Usuario sin nombre'}
                                {m.user_id === user?.id ? ' (vos)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Campo: Participantes */}
                <div className="form-group">
                    <label className="form-label">
                        Participantes <span className="form-label__required">*</span>
                    </label>
                    <MiembrosSelector
                        miembros={miembros}
                        seleccionados={participantes}
                        onChange={setParticipantes}
                    />
                    {participantes.length === 0 && (
                        <p className="form-hint form-hint--error">
                            Seleccioná al menos un participante.
                        </p>
                    )}
                </div>

                {/* Preview de división igualitaria */}
                {divisionPreview && (
                    <div className="grupo-gasto-nuevo__preview">
                        <span className="material-symbols-outlined grupo-gasto-nuevo__preview-icon">
                            calculate
                        </span>
                        <div>
                            <p className="grupo-gasto-nuevo__preview-texto">
                                Cada uno paga:{' '}
                                <strong>{formatearMonto(divisionPreview.base)}</strong>
                                {' '}({participantes.length} participante{participantes.length !== 1 ? 's' : ''})
                            </p>
                            {divisionPreview.tieneDiferencia && (
                                <p className="grupo-gasto-nuevo__preview-nota">
                                    El pagador absorbe {formatearMonto(divisionPreview.diferencia)} de diferencia por redondeo.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Campo: Nota (opcional) */}
                <div className="form-group">
                    <label className="form-label" htmlFor="nota">
                        Nota <span className="form-label__opcional">(opcional)</span>
                    </label>
                    <textarea
                        id="nota"
                        className="input"
                        placeholder="Detalles adicionales..."
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        rows={3}
                        maxLength={500}
                    />
                </div>

                {/* Acciones */}
                <div className="grupo-gasto-nuevo__actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(`/grupos/${grupoId}`, { state: { tab: 'gastos' } })}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={participantes.length === 0 || !monto || monto <= 0}
                    >
                        <span className="material-symbols-outlined">save</span>
                        Guardar cambios
                    </button>
                </div>
            </form>
        </div>
    );
};

export default GrupoGastoEditar;
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

```bash
cd client && npx vitest run src/pages/grupos/GrupoGastoEditar.test.jsx
```

Expected: PASS (los 4 tests en verde).

- [ ] **Step 5: Lint y build**

```bash
npm --prefix client run lint && npm --prefix client run build
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/grupos/GrupoGastoEditar.jsx client/src/pages/grupos/GrupoGastoEditar.test.jsx
git commit -m "feat(grupos): ChipSelector + flag acepta_cuotas + fase guardando/resultado en edición de gasto grupal"
```

---

### Task 8: Verificación manual end-to-end

Este task no tiene tests automatizados — cubre la verificación funcional real contra Supabase, que requiere que la migración de Task 1 ya haya sido ejecutada por Nicolás.

**Precondición:** confirmar con Nicolás que la migración `20260717_metodo_pago_gastos_grupales.sql` ya corrió en Supabase antes de este task.

- [ ] **Step 1: Levantar el entorno**

```bash
npm run dev
```

- [ ] **Step 2: Probar alta de gasto grupal sin cuotas**

En el navegador: entrar a un grupo existente → "Cargar gasto" → completar descripción, monto, elegir una categoría (chip), elegir un método de pago que NO acepte cuotas (ej. EFECTIVO) → confirmar que no aparece selector de cuotas → guardar → verificar que se ve el spinner "Guardando gasto..." brevemente y luego la pantalla de éxito con botón "Continuar" → al hacer click, vuelve al detalle del grupo con el tab de gastos activo y el gasto nuevo visible.

- [ ] **Step 3: Probar alta de gasto grupal con cuotas**

Repetir el alta eligiendo un método de pago que SÍ acepta cuotas (ej. VISA/tarjeta) → confirmar que aparecen los campos "Cuotas" y "Mes de la primera cuota" → completar y guardar → verificar en Supabase (tabla `grupo_gastos`) que se crearon N filas con `id_metodo_pago` seteado correctamente (no `NULL`) y sin la columna `metodo_pago` (debe haber sido eliminada).

- [ ] **Step 4: Probar edición de un gasto grupal existente**

Entrar a "Editar gasto" de un gasto creado en el Step 2 o 3 → confirmar que el chip de método de pago correcto aparece ya seleccionado (`chip-selector__chip--activo`) → cambiar el método de pago a uno que acepte cuotas → confirmar que aparece el campo de mes de primera cuota → guardar → verificar el mensaje de éxito "Gasto actualizado".

- [ ] **Step 5: Confirmar que el panel de cuotas grupales sigue funcionando**

Ir a la vista de detalle del grupo, tab de cuotas/tarjetas (`GrupoCuotasCard`) → confirmar que solo aparecen ahí los gastos creados con un método de pago que acepta cuotas, y no los de efectivo/débito — esto valida que `obtenerCuotasGrupal` (Task 5, Step 4) filtra correctamente vía el nuevo join a `metodos_pago`.

- [ ] **Step 6: Correr la suite completa de tests antes de dar por cerrada la tarea**

```bash
npm --prefix client run lint && npm --prefix client run build
cd client && npx vitest run
cd ../server && npm run dev &  # levantar y confirmar GET /health responde ok, luego detener
```

Expected: lint y build sin errores, todos los tests en verde, `/health` responde `{ "ok": true }` o equivalente.

---

## Resumen de archivos tocados

- `server/db/migrations/20260717_metodo_pago_gastos_grupales.sql` (nuevo — entregar a Nicolás)
- `server/routes/grupos.js` (3 endpoints modificados)
- `client/src/lib/db.js` (4 funciones modificadas: crearGastoGrupal, crearGastoGrupalEnCuotas, actualizarGastoGrupal, obtenerCuotasGrupal)
- `client/src/pages/grupos/GrupoGastoNuevo.jsx` (reescrito)
- `client/src/pages/grupos/GrupoGastoEditar.jsx` (reescrito)
- `client/src/pages/grupos/GrupoGastoNuevo.test.jsx` (nuevo)
- `client/src/pages/grupos/GrupoGastoEditar.test.jsx` (nuevo)

No se tocan: `MiembrosSelector.jsx`, `cuotasHelper.js`, `cuotasGroupHelper.js` (se reutiliza `filtrarTarjetaCredito` sin cambios), `ChipSelector.jsx`, `ResultModal.jsx` (no se usa acá porque el patrón de fases se implementa inline, igual que en Dashboard.jsx, no como modal separado ya que estas páginas no son modales).
