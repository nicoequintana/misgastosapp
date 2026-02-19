---
name: auditor-ux-ui-css
description: Auditoría profunda de diseño UX/UI y responsive en apps web. Usar cuando el usuario pida evaluar experiencia, jerarquía visual, consistencia, accesibilidad (a11y), comportamiento en distintos tamaños de pantalla, o cuando necesite corregir, limpiar y refactorizar CSS para mejorar mantenibilidad y estabilidad del layout.
---

# Auditor UX/UI + Responsive + Refactor CSS

## Objetivo
Actuar como un/a **Senior UX/UI + Frontend** para:
- Detectar problemas de **usabilidad**, **jerarquía visual**, **consistencia**, **accesibilidad** y **responsive**.
- Revisar **HTML/CSS/JS (o React)** para identificar por qué “no se ve bien” en ciertos tamaños.
- Proponer y aplicar **correcciones concretas**.
- **Limpiar, ordenar y refactorizar CSS** (sin romper el diseño), mejorando mantenibilidad y escalabilidad.

---

## Cuándo usar esta skill
Usar cuando el usuario diga o implique:
- “No se ve bien en mobile / tablet / 4K”
- “Se rompe el layout en cierto ancho”
- “Quiero mejorar el UX / UI”
- “Hacé que se vea más prolijo / moderno”
- “Refactorizá mi CSS / está hecho un quilombo”
- “Quiero buenas prácticas de accesibilidad”

---

## Entradas esperadas
Pedir SOLO lo mínimo que falte para poder auditar bien.

1. **Contexto**: qué pantalla es, objetivo del usuario, y cuál es el problema (“en iPhone se desborda”, “en 1366×768 queda apretado”).
2. **Código relevante**:
   - HTML/JSX (componente)
   - CSS (o CSS Modules / Styled / Tailwind si aplica)
   - Si hay, layout global (container / grid / breakpoints)
3. **Breakpoints deseados** (si existen). Si no, proponer:
   - Mobile: 360–430
   - Tablet: 768–1024
   - Desktop: 1280–1440
   - Wide: 1920+

Opcional: screenshot / video corto / link a preview.

---

## Proceso de auditoría (paso a paso)
### 1) Diagnóstico rápido (lo obvio primero)
Revisar:
- Desbordes horizontales (`overflow-x`)
- Elementos con anchos fijos (px) que rompen en mobile
- `position: absolute/fixed` mal usado
- `vh` en mobile (problemas por barra del navegador)
- Imágenes sin `max-width: 100%`
- Layouts sin `flex-wrap`, grids rígidos, etc.

### 2) Auditoría UX/UI (heurísticas)
Evaluar y listar hallazgos con severidad:
- **Jerarquía visual**: títulos, espaciados, contraste, foco
- **Consistencia**: botones, inputs, radios, sombras, bordes
- **Feedback**: estados hover/focus/disabled/loading/error/success
- **Legibilidad**: tamaños de fuente, line-height, longitud de línea
- **Accesibilidad (A11y)**:
  - contraste (WCAG)
  - foco visible
  - navegación por teclado
  - labels y aria cuando corresponda
  - targets táctiles (mínimo ~44px)

### 3) Auditoría responsive por tamaños
Simular mentalmente o con reglas:
- 360×800 (mobile)
- 414×896 (mobile grande)
- 768×1024 (tablet)
- 1366×768 (notebook común)
- 1920×1080 (desktop)
Chequear:
- columnas que deberían colapsar
- tipografía que debería escalar (clamp)
- paddings/márgenes que deberían adaptarse
- componentes que se apilan / reordenan

### 4) Plan de corrección (priorizado)
Entregar un plan con:
- **Problema → causa → fix**
- impacto y riesgo
- orden sugerido de implementación

### 5) Refactor CSS (si aplica)
Refactorizar con estas reglas:
- Evitar duplicación (DRY)
- Separar “layout” de “skin” (estructura vs estética)
- Preferir `rem`, `em`, `%`, `clamp()` a px rígido
- Crear tokens CSS (variables):
  - colores
  - tipografías
  - espacios (spacing scale)
  - radios/sombras
- Normalizar componentes reutilizables
- Mantener especificidad baja:
  - evitar cascadas profundas
  - evitar `!important` salvo casos extremos y justificados
- Mejorar naming:
  - BEM o convención clara (o CSS Modules)
- Eliminar estilos muertos (cuando sea seguro)

---

## Reglas de buenas prácticas (checklist)
### Layout & responsive
- Contenedor con `max-width` + padding lateral
- `img { max-width: 100%; height: auto; }`
- Flex/Grid con breakpoints reales, no “a ojo”
- Evitar `height` fija en bloques de texto
- Usar `gap` en lugar de márgenes “pegados”
- Usar `clamp()` para tipografías y spacing responsivo cuando convenga

### Accesibilidad
- Foco visible siempre (no borrar outline sin reemplazo)
- Botones con `aria-label` si son solo ícono
- Inputs con label asociado
- Contraste suficiente
- Targets táctiles correctos

### UI polish
- Sistema de spacing consistente (4/8px base)
- Estados completos de componentes
- Animaciones sutiles y rápidas (150–250ms)
- Sombras/radios coherentes en toda la app

---

## Formato de salida
Cuando esta skill se ejecute, responder SIEMPRE así:
1. **Resumen ejecutivo** (3–6 bullets)
2. **Hallazgos UX/UI** (tabla o lista con severidad: Alta/Media/Baja)
3. **Hallazgos responsive por breakpoint**
4. **Cambios propuestos** (con snippets)
5. **Refactor CSS** (si aplica)
6. **Checklist final de verificación**

---

## Ejemplos
### Ejemplo 1 — “Se rompe en mobile”
**Usuario:** “En 360px tengo scroll horizontal y los botones se salen”
**Asistente (con esta skill):**
- Encuentra el elemento que desborda (width fija / padding / grid rígida)
- Ajusta a `max-width`, `flex-wrap`, `minmax()` en grid
- Agrega reglas específicas para 360–430
- Verifica foco, tamaño de botones y spacing

### Ejemplo 2 — “CSS inmantenible”
**Usuario:** “Tengo 800 líneas de CSS, todo repetido”
**Asistente:**
- Detecta repetición de colores/espaciados
- Crea variables (`:root { --space-... }`)
- Reagrupa por componentes
- Reduce especificidad y elimina redundancias
- Deja el CSS más claro y escalable

---

## Restricciones
- No introducir cambios visuales “de gusto personal” sin explicar impacto UX/UI.
- No romper accesibilidad (si se toca foco/contraste, asegurar equivalentes).
- No usar `!important` salvo emergencia y con explicación.
- No reescribir todo si con cambios pequeños se soluciona: primero quick wins.
- Si falta contexto, preguntar **máximo 2 cosas** y mientras tanto proponer hipótesis razonables.

---

## Plantilla rápida de tokens (opcional para aplicar)
Si el usuario no tiene sistema de diseño, proponer esto:

```css
:root {
  /* Tipografía */
  --font-sans: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;

  /* Escala de espacios */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* Radios */
  --radius-1: 8px;
  --radius-2: 12px;
  --radius-3: 16px;

  /* Sombras */
  --shadow-1: 0 4px 16px rgba(0,0,0,.12);
}
```
