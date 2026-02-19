---
name: skill-creator
description: Meta-skill para crear y gestionar nuevas habilidades (skills) de Antigravity. Úsala cuando el usuario quiera añadir nuevas instrucciones, scripts o recursos para extender mis capacidades.
---

# Creador de Skills (Meta-Skill)

Esta skill me permite crear nuevas habilidades especializadas para extender mis capacidades. Seguir este esquema garantiza que todas las skills sean consistentes, portátiles y fáciles de usar.

## Reglas Principales para Crear Skills

1. **Estructura Independiente**: Cada skill debe vivir en su propio directorio dentro de `skills/`.
2. **Archivo Obligatorio**: Cada skill DEBE tener un archivo `SKILL.md` en su directorio raíz.
3. **Frontmatter YAML**: `SKILL.md` debe comenzar con un bloque YAML que contenga `name` y `description`.
4. **Idioma**: Todas las instrucciones y documentación deben estar en **Español** (según las reglas globales del workspace).

## Plantilla de Estructura de Carpetas

```text
skills/<nombre-de-la-skill>/
├── SKILL.md            # Punto de entrada principal (Obligatorio)
├── scripts/            # Scripts de ayuda (Python, JS, Shell)
├── examples/           # Código de referencia o patrones de uso
├── resources/           # Recursos, archivos de datos o plantillas
└── metadata.json       # Opcional: versión o configuración extra
```

## Flujo de Trabajo para Crear una Nueva Skill

### 1. Recolección de Requisitos
Pedir al usuario:
- **Nombre**: Corto, en kebab-case (ej: `experto-supabase`, `componentes-react-ui`).
- **Objetivo**: ¿Para qué servirá exactamente esta skill?
- **Contexto**: ¿Hay archivos o documentación existente que debas incorporar?

### 2. Generación de Archivos
1. Crear el directorio base: `skills/<nombre>/`.
2. Crear los subdirectorios: `scripts/`, `examples/`, `resources/`.
3. Crear el `SKILL.md` con:
   - Nombre y descripción en YAML.
   - Instrucciones detalladas para mí (cómo usar la skill).
   - Checklists para la tarea específica.
   - Ejemplos de "Qué hacer" vs "Qué NO hacer".

### 3. Verificación
- Intentar usar la skill inmediatamente realizando una tarea pequeña.
- Asegurar que la skill respete los principios **SOLID**, **DRY** y **KISS**.

---

## Plantilla de `SKILL.md`

```markdown
---
name: <nombre-kebab-case>
description: <descripción-concisa-para-descubrimiento>
---

# <Título de la Skill>

<Descripción detallada del objetivo de la skill>

## Instrucciones
- [Instrucción específica 1]
- [Instrucción específica 2]

## Cuándo Usar esta Skill
- Escenario A
- Escenario B

## Ejemplos
### ✅ Bien
`ejemplo de código o patrón correcto`

### ❌ Mal
`qué evitar o malas prácticas`
```
