# Simplificación de carga de gastos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los `<select>` nativos de categoría/método de pago/fijo-variable en el formulario de carga de gastos por chips visuales (ícono + nombre) con progressive disclosure, y eliminar el string-matching frágil que hoy detecta "tarjeta de crédito" y "préstamo" comparando `nombre === 'TARJETA DE CREDITO'` / `'PRESTAMOS'`, reemplazándolo por flags explícitos en el modelo de datos.

**Architecture:** Se agregan columnas (`tipo`, `acepta_cuotas`, `icono`, `user_id` en `metodos_pago`; `icono`, `es_prestamo` en `categorias`) vía migración SQL. Se crean dos componentes reutilizables (`ChipSelector`, `IconPicker`) usados en Dashboard.jsx, Movements.jsx y Configuracion.jsx. La lógica de detección de cuotas pasa de comparar strings a leer flags booleanos ya presentes en los objetos de categoría/método de pago que ya viajan en el estado del formulario — no requiere queries adicionales.

**Tech Stack:** React 19, Vite, Vitest (tests), Supabase (Postgres + RLS), CSS puro con variables de diseño existentes (`--glass-bg`, `--glass-border`, `--radius-md`, `--primary-light`), Material Symbols.

**Spec de referencia:** `docs/superpowers/specs/2026-07-16-simplificacion-carga-gastos-design.md`

---

## Orden de ejecución y dependencias

```
Task 0 (setup: testing-library + jsdom para tests de componentes)
   └─> Task 1 (migración SQL)
          └─> Task 2 (cuotasGroupHelper: flags en vez de strings)
                 └─> Task 3 (db.js: extender getCategories/getPaymentMethods + CRUD metodos_pago)
                        ├─> Task 4 (ChipSelector component)
                        ├─> Task 5 (IconPicker component)
                        └─> Task 6 (Dashboard.jsx: reemplazar selects + lógica de flags)
                               ├─> Task 7 (Movements.jsx: modal de edición con ChipSelector)
                               └─> Task 8 (Configuracion.jsx: CRUD de métodos de pago + IconPicker en alta de categoría)
Task 9 (verificación end-to-end manual)
```

Tasks 4 y 5 pueden hacerse en paralelo entre sí (ambas dependen solo de Task 3, pero no entre ellas). Tasks 7 y 8 dependen de 4, 5 y 6 pero no entre sí.

---

### Task 0: Setup de testing-library para tests de componentes React

**Contexto:** el proyecto hoy solo usa Vitest en modo `environment: 'node'` (ver `client/vite.config.js:7`), sin `@testing-library/react` ni `jsdom` — los tests existentes (`cuotasHelper.test.js`, `cuotas.calculos.test.js`, etc.) son todos de funciones puras, ninguno renderiza JSX. Los componentes nuevos (`ChipSelector`, `IconPicker`) sí necesitan renderizar y simular clicks, así que hace falta este setup antes de Task 4.

**Files:**
- Modify: `client/package.json` (nuevas devDependencies)
- Modify: `client/vite.config.js:6-10`

- [ ] **Step 1: Instalar las dependencias de testing**

Run: `npm --prefix client install -D @testing-library/react @testing-library/jest-dom jsdom`
Expected: instalación exitosa, nuevas entradas en `client/package.json` devDependencies.

- [ ] **Step 2: Configurar `environment: 'jsdom'` en `vite.config.js`**

Reemplazar `client/vite.config.js:6-10`:

```js
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
    coverage: { reporter: ['text'] },
  },
```

- [ ] **Step 3: Crear el archivo de setup**

Create: `client/src/test-setup.js`

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Verificar que la suite existente sigue pasando con el nuevo entorno**

Run: `npm --prefix client run test`
Expected: PASS en todos los tests preexistentes (los tests de funciones puras no se ven afectados por el cambio de `environment: 'node'` a `'jsdom'`).

- [ ] **Step 5: Commit**

```bash
git add client/package.json client/package-lock.json client/vite.config.js client/src/test-setup.js
git commit -m "test: add testing-library/react + jsdom setup for component tests"
```

---

### Task 1: Migración SQL — columnas nuevas y RLS de métodos de pago

**Files:**
- Create: `server/db/migrations/20260716_chips_categorias_metodos_pago.sql`
- Modify: `TECHNICAL_DOCS.md:216-240` (documentación de schema `categorias` y `metodos_pago`)

- [ ] **Step 1: Escribir la migración SQL**

```sql
-- Descripción: Agrega soporte para chips con ícono en categorías y métodos de pago,
-- y reemplaza el string-matching de "TARJETA DE CREDITO"/"PRESTAMOS" por flags explícitos.
-- Habilita además el CRUD de usuario sobre metodos_pago (antes solo lectura global).

-- ── categorias ──────────────────────────────────────────────
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS icono VARCHAR(50) NOT NULL DEFAULT 'label';
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS es_prestamo BOOLEAN NOT NULL DEFAULT false;

-- ── metodos_pago ────────────────────────────────────────────
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'efectivo';
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS acepta_cuotas BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE metodos_pago ADD COLUMN IF NOT EXISTS icono VARCHAR(50) NOT NULL DEFAULT 'payments';

ALTER TABLE metodos_pago ADD CONSTRAINT metodos_pago_tipo_check
  CHECK (tipo IN ('efectivo', 'tarjeta', 'cuenta'));

-- ── Migración de datos existentes ───────────────────────────
-- Ejecutar y REVISAR el resultado antes de dar por cerrada la migración:
UPDATE metodos_pago SET tipo = 'tarjeta', acepta_cuotas = true, icono = 'credit_card'
  WHERE UPPER(nombre) = 'TARJETA DE CREDITO';

UPDATE categorias SET es_prestamo = true, icono = 'handshake'
  WHERE UPPER(nombre) = 'PRESTAMOS';

-- ── RLS: habilitar CRUD de usuario sobre metodos_pago ───────
-- Hoy metodos_pago no tiene policies de insert/update/delete de usuario (solo lectura global).
DROP POLICY IF EXISTS "metodos_pago_select" ON metodos_pago;
DROP POLICY IF EXISTS "metodos_pago_insert" ON metodos_pago;
DROP POLICY IF EXISTS "metodos_pago_update" ON metodos_pago;
DROP POLICY IF EXISTS "metodos_pago_delete" ON metodos_pago;

CREATE POLICY "metodos_pago_select" ON metodos_pago
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "metodos_pago_insert" ON metodos_pago
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "metodos_pago_update" ON metodos_pago
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "metodos_pago_delete" ON metodos_pago
  FOR DELETE USING (auth.uid() = user_id);

-- Verificar tras ejecutar:
-- SELECT nombre, tipo, acepta_cuotas, icono FROM metodos_pago ORDER BY nombre;
-- SELECT nombre, icono, es_prestamo FROM categorias WHERE es_prestamo = true;
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'metodos_pago';
```

- [ ] **Step 2: Entregar la migración a Nicolás para ejecutar en Supabase SQL Editor**

No asumir ejecutado. Avisar explícitamente: *"Antes de correr el UPDATE de `tipo='tarjeta'`, revisá si tenés más de un método de pago que debería aceptar cuotas — hoy la migración solo detecta el que se llama exactamente 'TARJETA DE CREDITO'."*

- [ ] **Step 3: Actualizar `TECHNICAL_DOCS.md`**

En la sección de schema de `categorias` (línea ~216-229) agregar las columnas `icono` y `es_prestamo` a la tabla documentada. En la sección de `metodos_pago` (línea ~231-240) agregar `tipo`, `acepta_cuotas`, `icono`, y anotar que `user_id` ahora tiene CRUD real (no solo lectura).

- [ ] **Step 4: Commit**

```bash
git add server/db/migrations/20260716_chips_categorias_metodos_pago.sql TECHNICAL_DOCS.md
git commit -m "feat(db): add icono/tipo/acepta_cuotas flags to categorias y metodos_pago"
```

---

### Task 2: `cuotasGroupHelper.js` — reemplazar filtros por string-match con filtros por flag

**Files:**
- Modify: `client/src/lib/cuotasGroupHelper.js:28-44`
- Modify: `client/src/lib/cuotasGroupHelper.test.js`

**Contexto:** `filtrarTarjetaCredito` compara `g.metodos_pago?.nombre?.toUpperCase() === 'TARJETA DE CREDITO'` y `filtrarPrestamos` compara `g.categorias?.nombre?.toUpperCase() === 'PRESTAMOS'`. Ahora que `metodos_pago.acepta_cuotas` y `categorias.es_prestamo` existen como columnas, hay que traerlas en los `select()` de `db.js` (Task 3) y filtrar por el flag.

- [ ] **Step 1: Escribir los tests que validan el nuevo comportamiento (fallan hoy)**

Editar `client/src/lib/cuotasGroupHelper.test.js`, actualizando las factories para incluir el flag y agregando casos que ya no dependan del nombre:

```js
function mkCuota({ id, id_gasto_padre, numero_cuota, monto, fecha, descripcion = 'ITEM (1/3)', categoria = 'TARJETAS', esPrestamo = false, metodo = 'TARJETA DE CREDITO', aceptaCuotas = true }) {
    return {
        id,
        id_gasto_padre,
        numero_cuota,
        monto,
        fecha,
        descripcion,
        categorias: { id: 10, nombre: categoria, es_prestamo: esPrestamo },
        metodos_pago: { id: 1, nombre: metodo, acepta_cuotas: aceptaCuotas },
    };
}

function mkPrestamo({ id, id_gasto_padre, numero_cuota, monto, fecha, descripcion = 'PRESTAMO (1/6)' }) {
    return mkCuota({ id, id_gasto_padre, numero_cuota, monto, fecha, descripcion, categoria: 'PRESTAMOS', esPrestamo: true, metodo: 'TRANSFERENCIA', aceptaCuotas: false });
}
```

Agregar un test nuevo al describe de `filtrarTarjetaCredito`:

```js
it('filtra por el flag acepta_cuotas, no por el nombre del método de pago', () => {
    const rows = [
        mkCuota({ id: 1, id_gasto_padre: 100, numero_cuota: 1, monto: 500, fecha: '2025-01-01', metodo: 'VISA PLATINUM', aceptaCuotas: true }),
        mkCuota({ id: 2, id_gasto_padre: 200, numero_cuota: 1, monto: 300, fecha: '2025-01-01', metodo: 'TARJETA DE CREDITO', aceptaCuotas: false }),
    ];
    const resultado = filtrarTarjetaCredito(rows);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(1);
});
```

Y al describe de `filtrarPrestamos`:

```js
it('filtra por el flag es_prestamo, no por el nombre de la categoría', () => {
    const rows = [
        mkCuota({ id: 1, id_gasto_padre: 100, numero_cuota: 1, monto: 500, fecha: '2025-01-01', categoria: 'CREDITOS PERSONALES', esPrestamo: true }),
        mkCuota({ id: 2, id_gasto_padre: 200, numero_cuota: 1, monto: 300, fecha: '2025-01-01', categoria: 'PRESTAMOS', esPrestamo: false }),
    ];
    const resultado = filtrarPrestamos(rows);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(1);
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm --prefix client run test -- cuotasGroupHelper`
Expected: FAIL en los dos tests nuevos (siguen comparando por nombre).

- [ ] **Step 3: Implementar el cambio en `cuotasGroupHelper.js`**

```js
/**
 * Filtra filas cuyo método de pago acepta cuotas (flag explícito, no por nombre).
 *
 * @param {Array} rows
 * @returns {Array}
 */
export function filtrarTarjetaCredito(rows) {
    return rows.filter(g => g.metodos_pago?.acepta_cuotas === true);
}

/**
 * Filtra filas cuya categoría está marcada como préstamo (flag explícito, no por nombre).
 *
 * @param {Array} rows
 * @returns {Array}
 */
export function filtrarPrestamos(rows) {
    return rows.filter(g => g.categorias?.es_prestamo === true);
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm --prefix client run test -- cuotasGroupHelper`
Expected: PASS, todos los tests incluidos los preexistentes.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/cuotasGroupHelper.js client/src/lib/cuotasGroupHelper.test.js
git commit -m "fix(cuotas): reemplazar string-match por flags acepta_cuotas/es_prestamo"
```

---

### Task 3: `db.js` — traer los nuevos campos y agregar CRUD de métodos de pago

**Files:**
- Modify: `client/src/lib/db.js:283-311` (`getTarjetasEnCuotas`)
- Modify: `client/src/lib/db.js:122-146` (`getExpenses`)
- Modify: `client/src/lib/db.js:607-699` (`getCategories`, `createCategory`, `getPaymentMethods`)

**Contexto:** Hay que (a) traer `icono`/`es_prestamo` en categorías y `icono`/`tipo`/`acepta_cuotas` en métodos de pago en todos los `select()` relevantes, (b) sacar el `.ilike('metodos_pago.nombre', 'TARJETA DE CREDITO')` embebido en la query de `getTarjetasEnCuotas` (ya no hace falta, se filtra client-side con el flag vía `filtrarTarjetaCredito`), y (c) agregar `createPaymentMethod`/`updatePaymentMethod`/`deletePaymentMethod`.

- [ ] **Step 1: Quitar el filtro `.ilike` de `getTarjetasEnCuotas`**

En `client/src/lib/db.js:283-297`, el filtro SQL ya no es necesario porque `filtrarTarjetaCredito` (Task 2) ahora filtra por `acepta_cuotas` sobre los datos ya traídos:

```js
export const getTarjetasEnCuotas = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('gastos')
        .select(`
            id, descripcion, monto, fecha, cuotas, numero_cuota, id_gasto_padre,
            categorias:id_categoria (id, nombre, es_prestamo),
            metodos_pago:id_metodo_pago (id, nombre, acepta_cuotas)
        `)
        .eq('user_id', usuario.id)
        .not('id_gasto_padre', 'is', null)
        .order('id_gasto_padre', { ascending: true })
        .order('numero_cuota', { ascending: true });

    if (error) throw error;
    // resto de la función sin cambios (agruparPorPadre + filtrarTarjetaCredito + transformarGrupoCuotas)
```

- [ ] **Step 2: Agregar `es_prestamo` y `acepta_cuotas` a los `select()` de `getPrestamosEnCuotas`, `getPrestamosGastosFuturos`, `getGastosFuturos`**

En cada uno de esos tres `select()` (líneas ~324-328, ~363-367, ~399-403), cambiar:
```js
categorias:id_categoria (id, nombre),
metodos_pago:id_metodo_pago (id, nombre)
```
por:
```js
categorias:id_categoria (id, nombre, es_prestamo),
metodos_pago:id_metodo_pago (id, nombre, acepta_cuotas)
```

- [ ] **Step 3: Agregar `icono` al `select()` de `getExpenses`**

En `client/src/lib/db.js:132-138`, cambiar:
```js
categorias:id_categoria (id, nombre),
metodos_pago:id_metodo_pago (id, nombre)
```
por:
```js
categorias:id_categoria (id, nombre, icono),
metodos_pago:id_metodo_pago (id, nombre, icono)
```

- [ ] **Step 4: Extender `getCategories` para traer `icono` y `es_prestamo`, y `createCategory` para aceptar ícono**

En `client/src/lib/db.js:607-629`, el `select('*')` ya trae todas las columnas, así que no requiere cambios de query — solo confirmar que el spread `...cat` ya incluye `icono`/`es_prestamo` (sí, porque viene de `select('*')`).

En `client/src/lib/db.js:639-660`, extender `createCategory` para aceptar un segundo parámetro opcional `icono`:

```js
/**
 * Crea una nueva categoría personal para el usuario autenticado.
 * Las categorías personales son visibles solo para ese usuario.
 *
 * @param {string} nombre - Nombre de la categoría (se normaliza a mayúsculas)
 * @param {string} [icono='label'] - Nombre del ícono Material Symbols
 * @returns {Object} La categoría creada
 * @throws {Error} Si el nombre está vacío o ya existe una categoría con ese nombre
 */
export const createCategory = async (nombre, icono = 'label') => {
    const usuario = await obtenerUsuarioActivo();

    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre de la categoría no puede estar vacío');
    }

    const nombreNormalizado = nombre.trim().toUpperCase();

    const { data, error } = await supabase
        .from('categorias')
        .insert([{ nombre: nombreNormalizado, user_id: usuario.id, icono }])
        .select()
        .single();

    if (error) {
        console.error('❌ Error en createCategory:', error);
        throw error;
    }

    return { ...data, es_propia: true };
};
```

- [ ] **Step 5: Agregar CRUD de métodos de pago**

Reemplazar `client/src/lib/db.js:685-699` (`getPaymentMethods`) por el bloque completo:

```js
/**
 * Obtiene los métodos de pago visibles para el usuario:
 * - Globales (user_id IS NULL)
 * - Propios del usuario autenticado
 *
 * @returns {Array} Lista de métodos de pago ordenados alfabéticamente, con flag `es_propio`
 */
export const getPaymentMethods = async () => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('metodos_pago')
        .select('*')
        .or(`user_id.is.null,user_id.eq.${usuario.id}`)
        .order('nombre');

    if (error) throw error;
    return (data ?? []).map(pm => ({
        ...pm,
        es_propio: pm.user_id === usuario.id,
    }));
};

/**
 * Crea un método de pago personal para el usuario autenticado.
 *
 * @param {Object} metodo
 * @param {string} metodo.nombre
 * @param {'efectivo'|'tarjeta'|'cuenta'} metodo.tipo
 * @param {string} [metodo.icono='payments']
 * @param {boolean} [metodo.acepta_cuotas=false]
 * @returns {Object} El método de pago creado
 */
export const createPaymentMethod = async ({ nombre, tipo, icono = 'payments', acepta_cuotas = false }) => {
    const usuario = await obtenerUsuarioActivo();

    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre del método de pago no puede estar vacío');
    }
    if (!['efectivo', 'tarjeta', 'cuenta'].includes(tipo)) {
        throw new Error('Tipo de método de pago inválido');
    }

    const { data, error } = await supabase
        .from('metodos_pago')
        .insert([{
            nombre: nombre.trim().toUpperCase(),
            tipo,
            icono,
            acepta_cuotas: Boolean(acepta_cuotas),
            user_id: usuario.id,
            activo: true,
        }])
        .select()
        .single();

    if (error) {
        console.error('❌ Error en createPaymentMethod:', error);
        throw error;
    }
    return { ...data, es_propio: true };
};

/**
 * Actualiza un método de pago propio del usuario autenticado.
 * Las RLS impiden actualizar métodos globales o de otros usuarios.
 *
 * @param {number} id
 * @param {Object} cambios - { nombre?, tipo?, icono?, acepta_cuotas? }
 */
export const updatePaymentMethod = async (id, cambios) => {
    const usuario = await obtenerUsuarioActivo();

    const { data, error } = await supabase
        .from('metodos_pago')
        .update({
            ...(cambios.nombre !== undefined ? { nombre: cambios.nombre.trim().toUpperCase() } : {}),
            ...(cambios.tipo !== undefined ? { tipo: cambios.tipo } : {}),
            ...(cambios.icono !== undefined ? { icono: cambios.icono } : {}),
            ...(cambios.acepta_cuotas !== undefined ? { acepta_cuotas: Boolean(cambios.acepta_cuotas) } : {}),
        })
        .eq('id', id)
        .eq('user_id', usuario.id)
        .select()
        .single();

    if (error) {
        console.error('❌ Error en updatePaymentMethod:', error);
        throw error;
    }
    return data;
};

/**
 * Elimina un método de pago propio del usuario autenticado.
 * Solo se pueden eliminar métodos propios (user_id = auth.uid()).
 *
 * @param {number} id
 * @throws {Error} Si el método tiene gastos asociados (FK constraint) o no es propio
 */
export const deletePaymentMethod = async (id) => {
    const usuario = await obtenerUsuarioActivo();

    const { error } = await supabase
        .from('metodos_pago')
        .delete()
        .eq('id', id)
        .eq('user_id', usuario.id);

    if (error) {
        console.error('❌ Error en deletePaymentMethod:', error);
        throw error;
    }
};
```

- [ ] **Step 6: Verificar manualmente contra Supabase (no hay test unitario para queries reales)**

Run: `npm run dev` y en el navegador, abrir el Dashboard — confirmar en la pestaña Network que `getPaymentMethods`/`getCategories` devuelven `icono`, `tipo`, `acepta_cuotas`, `es_prestamo` sin error 400 (columnas ya migradas en Task 1).

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/db.js
git commit -m "feat(db): CRUD de metodos_pago + traer icono/tipo/acepta_cuotas/es_prestamo en queries"
```

---

### Task 4: Componente `ChipSelector`

**Files:**
- Create: `client/src/components/ChipSelector.jsx`
- Create: `client/src/components/ChipSelector.test.jsx`
- Modify: `client/src/index.css` (nuevas clases `.chip-selector*`)

- [ ] **Step 1: Escribir el test del componente**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChipSelector from './ChipSelector';

const OPCIONES = [
    { id: 1, nombre: 'Supermercado', icono: 'shopping_cart' },
    { id: 2, nombre: 'Transporte', icono: 'directions_car' },
    { id: 3, nombre: 'Salud', icono: 'health_and_safety' },
    { id: 4, nombre: 'Ocio', icono: 'sports_esports' },
    { id: 5, nombre: 'Hogar', icono: 'home' },
    { id: 6, nombre: 'Ropa', icono: 'checkroom' },
    { id: 7, nombre: 'Farmacia', icono: 'medication' },
    { id: 8, nombre: 'Nafta', icono: 'local_gas_station' },
];

describe('ChipSelector', () => {
    it('muestra solo las primeras `limiteVisible` opciones y un chip "Ver más"', () => {
        render(<ChipSelector opciones={OPCIONES} valorSeleccionado={null} onChange={() => {}} limiteVisible={6} />);
        expect(screen.getByText('Supermercado')).toBeInTheDocument();
        expect(screen.getByText('Ropa')).toBeInTheDocument();
        expect(screen.queryByText('Farmacia')).not.toBeInTheDocument();
        expect(screen.getByText('Ver más')).toBeInTheDocument();
    });

    it('despliega el resto de opciones al tocar "Ver más"', () => {
        render(<ChipSelector opciones={OPCIONES} valorSeleccionado={null} onChange={() => {}} limiteVisible={6} />);
        fireEvent.click(screen.getByText('Ver más'));
        expect(screen.getByText('Farmacia')).toBeInTheDocument();
        expect(screen.getByText('Nafta')).toBeInTheDocument();
    });

    it('llama a onChange con el id de la opción tocada', () => {
        const onChange = vi.fn();
        render(<ChipSelector opciones={OPCIONES} valorSeleccionado={null} onChange={onChange} limiteVisible={6} />);
        fireEvent.click(screen.getByText('Transporte'));
        expect(onChange).toHaveBeenCalledWith(2);
    });

    it('marca visualmente el chip seleccionado', () => {
        render(<ChipSelector opciones={OPCIONES} valorSeleccionado={2} onChange={() => {}} limiteVisible={6} />);
        expect(screen.getByRole('button', { name: /Transporte/ })).toHaveClass('chip-selector__chip--activo');
    });

    it('no muestra el chip "Ver más" si hay menos opciones que el límite', () => {
        render(<ChipSelector opciones={OPCIONES.slice(0, 2)} valorSeleccionado={null} onChange={() => {}} limiteVisible={6} />);
        expect(screen.queryByText('Ver más')).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm --prefix client run test -- ChipSelector`
Expected: FAIL con "Failed to resolve import './ChipSelector'" (el componente no existe todavía).

- [ ] **Step 3: Implementar `ChipSelector.jsx`**

```jsx
import React, { useState } from 'react';

/**
 * Selector de opciones en formato chip (ícono + nombre), con progressive disclosure:
 * muestra las primeras `limiteVisible` opciones y un chip "Ver más" para desplegar el resto.
 *
 * @param {Array<{id: string|number, nombre: string, icono: string}>} opciones
 * @param {string|number|null} valorSeleccionado - id de la opción activa
 * @param {(id: string|number) => void} onChange
 * @param {number} [limiteVisible=6]
 */
const ChipSelector = ({ opciones, valorSeleccionado, onChange, limiteVisible = 6 }) => {
    const [expandido, setExpandido] = useState(false);

    const hayMas = opciones.length > limiteVisible;
    const visibles = expandido || !hayMas ? opciones : opciones.slice(0, limiteVisible);

    return (
        <div className="chip-selector">
            {visibles.map(op => (
                <button
                    key={op.id}
                    type="button"
                    className={`chip-selector__chip${valorSeleccionado === op.id ? ' chip-selector__chip--activo' : ''}`}
                    onClick={() => onChange(op.id)}
                >
                    <span className="material-symbols-outlined chip-selector__icono">{op.icono}</span>
                    <span>{op.nombre}</span>
                </button>
            ))}
            {hayMas && !expandido && (
                <button
                    type="button"
                    className="chip-selector__chip chip-selector__chip--ver-mas"
                    onClick={() => setExpandido(true)}
                >
                    <span className="material-symbols-outlined chip-selector__icono">expand_more</span>
                    <span>Ver más</span>
                </button>
            )}
        </div>
    );
};

export default ChipSelector;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm --prefix client run test -- ChipSelector`
Expected: PASS en los 5 tests.

- [ ] **Step 5: Agregar estilos en `client/src/index.css`**

Agregar al final del archivo, siguiendo la convención de `.reportes-chip` ya existente (línea ~5081):

```css
.chip-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip-selector__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--glass-bg) 78%, transparent);
  border: 1px solid var(--glass-border);
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}

.chip-selector__chip:hover {
  transform: translateY(-1px);
}

.chip-selector__chip--activo {
  background: var(--primary-light);
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  color: var(--primary);
}

.chip-selector__chip--ver-mas {
  opacity: 0.75;
}

.chip-selector__icono {
  font-size: 18px;
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ChipSelector.jsx client/src/components/ChipSelector.test.jsx client/src/index.css
git commit -m "feat(ui): add ChipSelector component with progressive disclosure"
```

---

### Task 5: Componente `IconPicker`

**Files:**
- Create: `client/src/components/IconPicker.jsx`
- Create: `client/src/components/IconPicker.test.jsx`
- Modify: `client/src/index.css` (nuevas clases `.icon-picker*`)

- [ ] **Step 1: Escribir el test del componente**

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IconPicker from './IconPicker';

describe('IconPicker', () => {
    it('muestra la lista curada de íconos', () => {
        render(<IconPicker valorSeleccionado="label" onChange={() => {}} />);
        expect(screen.getByLabelText(/shopping_cart/i)).toBeInTheDocument();
    });

    it('filtra íconos por texto de búsqueda', () => {
        render(<IconPicker valorSeleccionado="label" onChange={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText('Buscar ícono...'), { target: { value: 'car' } });
        expect(screen.getByLabelText('directions_car')).toBeInTheDocument();
        expect(screen.queryByLabelText('health_and_safety')).not.toBeInTheDocument();
    });

    it('llama a onChange con el nombre del ícono tocado', () => {
        const onChange = vi.fn();
        render(<IconPicker valorSeleccionado="label" onChange={onChange} />);
        fireEvent.click(screen.getByLabelText('directions_car'));
        expect(onChange).toHaveBeenCalledWith('directions_car');
    });

    it('marca visualmente el ícono seleccionado', () => {
        render(<IconPicker valorSeleccionado="directions_car" onChange={() => {}} />);
        expect(screen.getByLabelText('directions_car')).toHaveClass('icon-picker__icono--activo');
    });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm --prefix client run test -- IconPicker`
Expected: FAIL con "Failed to resolve import './IconPicker'".

- [ ] **Step 3: Implementar `IconPicker.jsx`**

```jsx
import React, { useState, useMemo } from 'react';

// Lista curada de Material Symbols para categorías y métodos de pago.
// Se mantiene acotada (no la librería completa) para consistencia visual y peso de bundle.
const ICONOS_CURADOS = [
    'shopping_cart', 'directions_car', 'health_and_safety', 'sports_esports',
    'home', 'checkroom', 'medication', 'local_gas_station', 'restaurant',
    'local_cafe', 'flight', 'school', 'pets', 'fitness_center', 'movie',
    'devices', 'phone_iphone', 'wifi', 'lightbulb', 'water_drop',
    'local_grocery_store', 'card_giftcard', 'celebration', 'child_care',
    'spa', 'local_hospital', 'directions_bus', 'local_taxi', 'apartment',
    'receipt_long', 'account_balance', 'savings', 'handshake', 'payments',
    'credit_card', 'account_balance_wallet', 'attach_money', 'label',
];

/**
 * Grid de selección de ícono con buscador de texto simple.
 *
 * @param {string} valorSeleccionado - nombre del ícono actualmente elegido
 * @param {(icono: string) => void} onChange
 */
const IconPicker = ({ valorSeleccionado, onChange }) => {
    const [busqueda, setBusqueda] = useState('');

    const filtrados = useMemo(() => {
        if (!busqueda.trim()) return ICONOS_CURADOS;
        const q = busqueda.trim().toLowerCase();
        return ICONOS_CURADOS.filter(nombre => nombre.includes(q));
    }, [busqueda]);

    return (
        <div className="icon-picker">
            <input
                type="text"
                className="input icon-picker__buscador"
                placeholder="Buscar ícono..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
            />
            <div className="icon-picker__grid">
                {filtrados.map(nombre => (
                    <button
                        key={nombre}
                        type="button"
                        aria-label={nombre}
                        className={`icon-picker__icono${valorSeleccionado === nombre ? ' icon-picker__icono--activo' : ''}`}
                        onClick={() => onChange(nombre)}
                        title={nombre}
                    >
                        <span className="material-symbols-outlined">{nombre}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default IconPicker;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm --prefix client run test -- IconPicker`
Expected: PASS en los 4 tests.

- [ ] **Step 5: Agregar estilos en `client/src/index.css`**

```css
.icon-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.icon-picker__buscador {
  width: 100%;
}

.icon-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
}

.icon-picker__icono {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--glass-bg) 78%, transparent);
  border: 1px solid var(--glass-border);
  color: var(--text-main);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.icon-picker__icono--activo {
  background: var(--primary-light);
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  color: var(--primary);
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/components/IconPicker.jsx client/src/components/IconPicker.test.jsx client/src/index.css
git commit -m "feat(ui): add IconPicker component with curated Material Symbols list"
```

---

### Task 6: `Dashboard.jsx` — reemplazar selects por ChipSelector y flags explícitos

**Files:**
- Modify: `client/src/pages/Dashboard.jsx:1-15` (imports)
- Modify: `client/src/pages/Dashboard.jsx:529-556` (`handleCambioMetodoPago`, `handleCambioCategoria`)
- Modify: `client/src/pages/Dashboard.jsx:734-836` (JSX del form)

- [ ] **Step 1: Agregar el import de `ChipSelector`**

En `client/src/pages/Dashboard.jsx:5`, después de `import CurrencyInput from '../components/CurrencyInput';`:

```js
import ChipSelector from '../components/ChipSelector';
```

- [ ] **Step 2: Reescribir `handleCambioMetodoPago` y `handleCambioCategoria` para usar los flags**

Reemplazar `client/src/pages/Dashboard.jsx:528-556`:

```js
    // Detecta si el método de pago seleccionado acepta cuotas (flag explícito en metodos_pago.acepta_cuotas)
    const handleCambioMetodoPago = (id) => {
        const metodo = paymentMethods.find(pm => pm.id === Number(id) || pm.id === id);
        const esTarjeta = metodo?.acepta_cuotas === true;
        setExpenseForm(prev => ({
            ...prev,
            id_metodo_pago: id,
            esTarjetaCredito: esTarjeta,
            // Al cambiar el método, reseteamos cuotas, primeraCuota y desbloqueamos es_fijo
            cuotas: 1,
            primeraCuota: '',
            es_fijo: esTarjeta ? true : prev.es_fijo,
        }));
    };

    // Detecta si la categoría seleccionada es de tipo préstamo (flag explícito en categorias.es_prestamo)
    const handleCambioCategoria = (id) => {
        const cat = categories.find(c => c.id === Number(id) || c.id === id);
        const esPrestamo = cat?.es_prestamo === true;
        setExpenseForm(prev => ({
            ...prev,
            id_categoria: id,
            esPrestamo,
            // Al cambiar categoría, reseteamos cuotas y primeraCuota si ya no aplica
            cuotas: esPrestamo ? prev.cuotas : (prev.esPrestamo ? 1 : prev.cuotas),
            primeraCuota: esPrestamo ? prev.primeraCuota : (prev.esPrestamo ? '' : prev.primeraCuota),
            es_fijo: esPrestamo ? true : prev.es_fijo,
        }));
    };
```

- [ ] **Step 3: Reemplazar los `<select>` de Categoría y Método de Pago por `ChipSelector`**

Reemplazar `client/src/pages/Dashboard.jsx:734-763`:

```jsx
                    <div className="form-group">
                        <label className="form-label-box">Categoría</label>
                        <ChipSelector
                            opciones={categories}
                            valorSeleccionado={expenseForm.id_categoria ? Number(expenseForm.id_categoria) : null}
                            onChange={(id) => handleCambioCategoria(id)}
                            limiteVisible={6}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label-box">Método de Pago</label>
                        <ChipSelector
                            opciones={paymentMethods}
                            valorSeleccionado={expenseForm.id_metodo_pago ? Number(expenseForm.id_metodo_pago) : null}
                            onChange={(id) => handleCambioMetodoPago(id)}
                            limiteVisible={6}
                        />
                    </div>
```

- [ ] **Step 4: Reemplazar el checkbox "Gasto Fijo" por `ChipSelector` de 2 opciones**

Reemplazar `client/src/pages/Dashboard.jsx:826-836`:

```jsx
                    {!expenseForm.esTarjetaCredito && !expenseForm.esPrestamo && (
                        <div className="form-group">
                            <label className="form-label-box">Tipo de gasto</label>
                            <ChipSelector
                                opciones={[
                                    { id: 'variable', nombre: 'Variable', icono: 'trending_down' },
                                    { id: 'fijo', nombre: 'Fijo', icono: 'lock' },
                                ]}
                                valorSeleccionado={expenseForm.es_fijo ? 'fijo' : 'variable'}
                                onChange={(id) => setExpenseForm(prev => ({ ...prev, es_fijo: id === 'fijo' }))}
                                limiteVisible={2}
                            />
                        </div>
                    )}
```

- [ ] **Step 5: Verificación manual en navegador**

Run: `npm run dev`

En el Dashboard, abrir "Nuevo Gasto":
- Confirmar que Categoría y Método de Pago se ven como chips con ícono, no como `<select>`.
- Elegir una categoría con más de 6 opciones disponibles → confirmar que aparece "Ver más" y despliega el resto.
- Elegir un método de pago con `acepta_cuotas=true` (el que la migración marcó como tarjeta) → confirmar que aparece la sección de cuotas + mes de primera cuota, igual que antes.
- Elegir una categoría con `es_prestamo=true` → confirmar que aparece la sección de cuotas de préstamo.
- Con un método de pago sin cuotas y categoría sin préstamo → confirmar que aparecen los chips "Variable"/"Fijo".
- Completar un gasto simple y guardar → confirmar que se guarda igual que antes (verificar en Movements.jsx que aparece).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): reemplazar selects de categoria/metodo pago/fijo por ChipSelector"
```

---

### Task 7: `Movements.jsx` — modal de edición con `ChipSelector`

**Files:**
- Modify: `client/src/pages/Movements.jsx:1-15` (imports, si `ChipSelector` no está ya importado)
- Modify: `client/src/pages/Movements.jsx:508-533` (selects de categoría/método de pago)
- Modify: `client/src/pages/Movements.jsx:545-554` (checkbox es_fijo)

- [ ] **Step 1: Agregar el import de `ChipSelector`**

Verificar el bloque de imports al inicio de `client/src/pages/Movements.jsx` y agregar:

```js
import ChipSelector from '../components/ChipSelector';
```

- [ ] **Step 2: Reemplazar los selects de Categoría y Método de Pago**

Reemplazar `client/src/pages/Movements.jsx:508-533`:

```jsx
                        <div className="form-group">
                            <label className="form-label-box">Categoría</label>
                            <ChipSelector
                                opciones={categories}
                                valorSeleccionado={gastoEditando.id_categoria ? Number(gastoEditando.id_categoria) : null}
                                onChange={(id) => setGastoEditando(prev => ({ ...prev, id_categoria: id }))}
                                limiteVisible={6}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label-box">Método de Pago</label>
                            <ChipSelector
                                opciones={paymentMethods}
                                valorSeleccionado={gastoEditando.id_metodo_pago ? Number(gastoEditando.id_metodo_pago) : null}
                                onChange={(id) => setGastoEditando(prev => ({ ...prev, id_metodo_pago: id }))}
                                limiteVisible={6}
                            />
                        </div>
```

- [ ] **Step 3: Reemplazar el checkbox "Gasto Fijo" por `ChipSelector`**

Reemplazar `client/src/pages/Movements.jsx:545-554`:

```jsx
                        <div className="form-group">
                            <label className="form-label-box">Tipo de gasto</label>
                            <ChipSelector
                                opciones={[
                                    { id: 'variable', nombre: 'Variable', icono: 'trending_down' },
                                    { id: 'fijo', nombre: 'Fijo', icono: 'lock' },
                                ]}
                                valorSeleccionado={gastoEditando.es_fijo ? 'fijo' : 'variable'}
                                onChange={(id) => setGastoEditando(prev => ({ ...prev, es_fijo: id === 'fijo' }))}
                                limiteVisible={2}
                            />
                        </div>
```

Nota: este modal no tiene el atributo `disabled={guardando}` disponible en `ChipSelector` (el componente no expone esa prop). Si el guardado tarda visiblemente, es un problema preexistente del mismo tamaño que ya tenía el `<select disabled>` — no se agrava ni se resuelve en este plan. Si se vuelve un problema real, es una mejora aparte de `ChipSelector` (agregar prop `disabled`), fuera de alcance de este plan.

- [ ] **Step 4: Verificación manual en navegador**

Run: `npm run dev`

En Movements, abrir "Editar Gasto" sobre un gasto existente → confirmar que los chips muestran preseleccionada la categoría/método de pago actuales del gasto, y que se puede cambiar y guardar correctamente.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Movements.jsx
git commit -m "feat(movements): reemplazar selects del modal de edicion por ChipSelector"
```

---

### Task 8: `Configuracion.jsx` — CRUD de métodos de pago + `IconPicker` en alta de categoría

**Files:**
- Modify: `client/src/pages/Configuracion.jsx:1-30` (imports, estado)
- Modify: `client/src/pages/Configuracion.jsx:52-94` (handlers de categoría)
- Modify: `client/src/pages/Configuracion.jsx:202-319` (sección "Mis Categorías" + nueva sección "Métodos de Pago")

**Nota de alcance:** este plan agrega la UI mínima funcional de CRUD de métodos de pago (crear, listar, eliminar propios) siguiendo el mismo patrón visual que ya existe para categorías en este archivo. No se agrega edición inline de métodos de pago existentes (`updatePaymentMethod` queda disponible en `db.js` desde Task 3 para una iteración futura si hace falta editar tipo/ícono de un método ya creado).

- [ ] **Step 1: Agregar imports y estado**

En `client/src/pages/Configuracion.jsx:1-4`, agregar:

```js
import ChipSelector from '../components/ChipSelector';
import IconPicker from '../components/IconPicker';
```

Después de `client/src/pages/Configuracion.jsx:28` (`const [confirmEliminarCat, setConfirmEliminarCat] = useState(null);`), agregar:

```js
    // ── Estado de ícono para nueva categoría ─────────────────────────
    const [iconoNuevaCategoria, setIconoNuevaCategoria] = useState('label');

    // ── Estado de métodos de pago personales ─────────────────────────
    const [metodosPago, setMetodosPago] = useState([]);
    const [cargandoMetodos, setCargandoMetodos] = useState(true);
    const [nuevoMetodo, setNuevoMetodo] = useState({ nombre: '', tipo: 'efectivo', icono: 'payments', acepta_cuotas: false });
    const [guardandoMetodo, setGuardandoMetodo] = useState(false);
    const [errorMetodo, setErrorMetodo] = useState('');
    const [eliminandoMetodoId, setEliminandoMetodoId] = useState(null);
    const [confirmEliminarMetodo, setConfirmEliminarMetodo] = useState(null);
```

- [ ] **Step 2: Actualizar `handleCrearCategoria` para enviar el ícono, y agregar carga + handlers de métodos de pago**

Reemplazar `client/src/pages/Configuracion.jsx:52-77` (`handleCrearCategoria`):

```js
    const handleCrearCategoria = async (e) => {
        e.preventDefault();
        if (!nuevaCategoria.trim()) {
            setErrorCat('Ingresá un nombre para la categoría');
            return;
        }
        // Verificar duplicados localmente
        const existe = categorias.some(
            c => c.nombre.toLowerCase() === nuevaCategoria.trim().toLowerCase()
        );
        if (existe) {
            setErrorCat('Ya existe una categoría con ese nombre');
            return;
        }
        setGuardandoCat(true);
        setErrorCat('');
        try {
            const nueva = await db.createCategory(nuevaCategoria, iconoNuevaCategoria);
            setCategorias(prev => [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setNuevaCategoria('');
            setIconoNuevaCategoria('label');
        } catch (err) {
            setErrorCat(err.message || 'Error al crear la categoría');
        } finally {
            setGuardandoCat(false);
        }
    };
```

Después de la función `handleEliminarCategoria` (`client/src/pages/Configuracion.jsx:79-94`), agregar:

```js
    // Carga inicial de métodos de pago
    const fetchMetodosPago = useCallback(async () => {
        setCargandoMetodos(true);
        try {
            const data = await db.getPaymentMethods();
            setMetodosPago(data);
        } catch (err) {
            console.error('❌ Error al cargar métodos de pago:', err);
        } finally {
            setCargandoMetodos(false);
        }
    }, []);

    useEffect(() => {
        fetchMetodosPago();
    }, [fetchMetodosPago]);

    const handleCrearMetodoPago = async (e) => {
        e.preventDefault();
        if (!nuevoMetodo.nombre.trim()) {
            setErrorMetodo('Ingresá un nombre para el método de pago');
            return;
        }
        const existe = metodosPago.some(
            pm => pm.nombre.toLowerCase() === nuevoMetodo.nombre.trim().toLowerCase()
        );
        if (existe) {
            setErrorMetodo('Ya existe un método de pago con ese nombre');
            return;
        }
        setGuardandoMetodo(true);
        setErrorMetodo('');
        try {
            const creado = await db.createPaymentMethod(nuevoMetodo);
            setMetodosPago(prev => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setNuevoMetodo({ nombre: '', tipo: 'efectivo', icono: 'payments', acepta_cuotas: false });
        } catch (err) {
            setErrorMetodo(err.message || 'Error al crear el método de pago');
        } finally {
            setGuardandoMetodo(false);
        }
    };

    const handleEliminarMetodoPago = async (id) => {
        setEliminandoMetodoId(id);
        try {
            await db.deletePaymentMethod(id);
            setMetodosPago(prev => prev.filter(pm => pm.id !== id));
        } catch (err) {
            const mensaje = err.code === '23503'
                ? 'No podés eliminar este método de pago porque tiene gastos asociados.'
                : (err.message || 'Error al eliminar el método de pago');
            setErrorMetodo(mensaje);
        } finally {
            setEliminandoMetodoId(null);
            setConfirmEliminarMetodo(null);
        }
    };
```

- [ ] **Step 3: Agregar el `IconPicker` al form de "Nueva Categoría"**

En `client/src/pages/Configuracion.jsx:215-240`, dentro del `<form onSubmit={handleCrearCategoria}>`, después del `cats-config-input-row` y antes del cierre del `</form>`, agregar:

```jsx
                    <IconPicker valorSeleccionado={iconoNuevaCategoria} onChange={setIconoNuevaCategoria} />
```

- [ ] **Step 4: Agregar la sección "Métodos de Pago" después de la sección "Mis Categorías"**

Después del cierre de `</GlassCard>` de la sección "Mis Categorías" (`client/src/pages/Configuracion.jsx:319`), agregar:

```jsx
            {/* ── MÉTODOS DE PAGO ────────────────────── */}
            <GlassCard className="config-section">
                <div className="config-section-header">
                    <span className="material-symbols-outlined config-section-icon">payments</span>
                    <h3 className="config-section-title">Métodos de Pago</h3>
                </div>

                <p className="cats-config-desc">
                    Los métodos de pago globales están disponibles para todos los usuarios y no se pueden eliminar.
                    Podés crear tus propios métodos personalizados — solo vos los verás.
                </p>

                <form onSubmit={handleCrearMetodoPago} className="cats-config-form">
                    <div className="cats-config-input-row">
                        <input
                            type="text"
                            value={nuevoMetodo.nombre}
                            onChange={(e) => setNuevoMetodo(prev => ({ ...prev, nombre: e.target.value }))}
                            placeholder="Nuevo método de pago..."
                            className="input cats-config-input"
                            maxLength={60}
                        />
                        <select
                            value={nuevoMetodo.tipo}
                            onChange={(e) => setNuevoMetodo(prev => ({ ...prev, tipo: e.target.value }))}
                            className="form-select"
                        >
                            <option value="efectivo">Efectivo</option>
                            <option value="tarjeta">Tarjeta</option>
                            <option value="cuenta">Cuenta</option>
                        </select>
                    </div>
                    <div className="form-checkbox-group">
                        <input
                            type="checkbox"
                            id="acepta_cuotas"
                            checked={nuevoMetodo.acepta_cuotas}
                            onChange={(e) => setNuevoMetodo(prev => ({ ...prev, acepta_cuotas: e.target.checked }))}
                        />
                        <label htmlFor="acepta_cuotas">Acepta pago en cuotas</label>
                    </div>
                    <IconPicker
                        valorSeleccionado={nuevoMetodo.icono}
                        onChange={(icono) => setNuevoMetodo(prev => ({ ...prev, icono }))}
                    />
                    <button
                        type="submit"
                        className="btn btn-primary cats-config-btn"
                        disabled={guardandoMetodo}
                    >
                        <span className="material-symbols-outlined">add</span>
                        <span>{guardandoMetodo ? 'Creando...' : 'Crear'}</span>
                    </button>
                    {errorMetodo && (
                        <p className="cats-config-error">{errorMetodo}</p>
                    )}
                </form>

                {cargandoMetodos ? (
                    <div className="cats-config-loading">
                        <span className="material-symbols-outlined cats-config-loading-icon">sync</span>
                        Cargando métodos de pago...
                    </div>
                ) : (
                    <div className="cats-config-list">
                        {metodosPago.filter(pm => !pm.es_propio).length > 0 && (
                            <div className="cats-config-group">
                                <p className="cats-config-group-label">
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle' }}>public</span>
                                    {' '}Globales
                                </p>
                                {metodosPago.filter(pm => !pm.es_propio).map(pm => (
                                    <div key={pm.id} className="cats-config-item cats-config-item--global">
                                        <span className="material-symbols-outlined cats-config-item-icon">{pm.icono}</span>
                                        <span className="cats-config-item-name">{pm.nombre}</span>
                                        <span className="cats-config-item-badge">Global</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {metodosPago.filter(pm => pm.es_propio).length > 0 && (
                            <div className="cats-config-group">
                                <p className="cats-config-group-label">
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle' }}>star</span>
                                    {' '}Mis métodos
                                </p>
                                {metodosPago.filter(pm => pm.es_propio).map(pm => (
                                    <div key={pm.id} className="cats-config-item cats-config-item--propia">
                                        <span className="material-symbols-outlined cats-config-item-icon">{pm.icono}</span>
                                        <span className="cats-config-item-name">{pm.nombre}</span>

                                        {confirmEliminarMetodo === pm.id ? (
                                            <div className="cats-config-item-confirm">
                                                <span className="cats-config-item-confirm-text">¿Eliminar?</span>
                                                <button
                                                    type="button"
                                                    className="cats-config-item-confirm-yes"
                                                    onClick={() => handleEliminarMetodoPago(pm.id)}
                                                    disabled={eliminandoMetodoId === pm.id}
                                                >
                                                    {eliminandoMetodoId === pm.id ? '...' : 'Sí'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="cats-config-item-confirm-no"
                                                    onClick={() => setConfirmEliminarMetodo(null)}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                className="cats-config-item-delete"
                                                onClick={() => setConfirmEliminarMetodo(pm.id)}
                                                title="Eliminar método de pago"
                                            >
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </GlassCard>
```

- [ ] **Step 5: Verificación manual en navegador**

Run: `npm run dev`

En Configuración:
- Crear una categoría nueva eligiendo un ícono distinto de "label" → confirmar que aparece en la lista con ese ícono, y que en el Dashboard el chip de esa categoría lo muestra.
- Crear un método de pago nuevo con tipo "tarjeta" y "acepta cuotas" tildado → confirmar que aparece en "Mis métodos", y que al elegirlo en el form de Nuevo Gasto dispara la sección de cuotas.
- Eliminar un método de pago propio sin gastos asociados → confirmar que desaparece de la lista.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Configuracion.jsx
git commit -m "feat(config): CRUD de metodos de pago + selector de icono en alta de categoria"
```

---

### Task 9: Verificación end-to-end y suite completa

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Correr toda la suite de tests**

Run: `npm --prefix client run test`
Expected: PASS en todos los archivos, incluidos `cuotas.calculos.test.js`, `cuotasHelper.test.js`, `cuotasGroupHelper.test.js`, `ChipSelector.test.jsx`, `IconPicker.test.jsx`.

- [ ] **Step 2: Lint y build**

Run: `npm --prefix client run lint && npm --prefix client run build`
Expected: sin errores.

- [ ] **Step 3: Flujo manual completo en navegador**

Run: `npm run dev`

Recorrer, en este orden:
1. Dashboard → Nuevo Gasto → gasto simple (efectivo, categoría cualquiera, variable) → Guardar → aparece en "Gastos Recientes".
2. Dashboard → Nuevo Gasto → método de pago con `acepta_cuotas=true`, 3 cuotas → Guardar → aparece en la card de Tarjeta de Crédito con 3 cuotas.
3. Dashboard → Nuevo Gasto → categoría `es_prestamo=true`, 12 cuotas → Guardar → aparece en la card de Préstamos.
4. Movements → Editar un gasto existente → cambiar categoría y método de pago vía chips → Actualizar → cambio reflejado.
5. Configuración → crear categoría con ícono custom y método de pago custom → volver a Dashboard → confirmar que aparecen como chips nuevos con su ícono.

- [ ] **Step 4: Reportar a Nicolás**

Confirmar explícitamente que la migración de Task 1 ya fue ejecutada en Supabase antes de dar la tarea por completada — sin eso, todos los `select()` que piden `icono`/`tipo`/`acepta_cuotas`/`es_prestamo` van a fallar con error 400 de columna inexistente.

---

## Spec coverage check

- Modelo de datos (columnas + migración + RLS): Task 1. ✅
- Reemplazo de string-matching por flags: Task 2 (filtros), Task 3 (queries), Task 6 (handlers de Dashboard). ✅
- `ChipSelector` reutilizable con límite + "ver más": Task 4. ✅
- `IconPicker` con lista curada + buscador: Task 5. ✅
- Formulario de Dashboard con los 3 chips (categoría, método de pago, fijo/variable) y trigger automático de cuotas: Task 6. ✅
- Modal de edición en Movements con los mismos chips: Task 7. ✅
- CRUD de métodos de pago + ícono en alta de categoría: Task 8. ✅
- Verificación de que nada rompe (tests + build + flujo manual): Task 9. ✅
- Fuera de alcance (SQL Server, billeteras con saldo, auto-submit): no generan tasks, documentado en el spec. ✅
