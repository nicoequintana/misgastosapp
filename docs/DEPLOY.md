# Deploy de Mis Gastos App

Este documento describe los pasos necesarios para desplegar la aplicación y configurar la base de datos en Supabase.

## 1. Configuración de Base de Datos (Supabase)

1.  Crea una cuenta en [Supabase](https://supabase.com).
2.  Crea un nuevo proyecto.
3.  Ve al **SQL Editor** en el panel lateral.
4.  Copia y pega el contenido del archivo `supabase_schema.sql` (ubicado en la raíz de este proyecto) y dale a **Run**.
    *   Esto creará las tablas `gastos` e `ingresos` con todos los campos en español necesarios.
    *   Habilitará las políticas de seguridad (RLS) básicas.

## 2. Variables de Entorno

### Backend (Node.js / Express)
Necesitarás las credenciales de tu proyecto de Supabase. Ve a **Project Settings -> API**.

Variables necesarias en tu servidor (ej. Railway, Render, Heroku):
```env
PORT=3001
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-anon-key-o-service-role
```

### Frontend (React / Vite)
El frontend necesita saber dónde está alojado tu backend.
Al desplegar el frontend (ej. Vercel, Netlify), configura esta variable:

```env
VITE_API_URL=https://url-de-tu-backend-desplegado.com
```

> **Nota:** Si haces deploy en Vercel, asegúrate de añadir `VITE_API_URL` en la sección "Environment Variables" del proyecto.

## 3. Despliegue

### Opción Recomendada: Monorepo
Si despliegas todo junto o separado, asegúrate de:
1.  En el **root** del proyecto, instalar dependencias (`npm install`).
2.  Para el **backend**, el comando de inicio suele ser `node server/index.js`.
3.  Para el **frontend**, el comando de build es `npm run build` (dentro de carpeta `client`) y la carpeta de salida es `dist`.
