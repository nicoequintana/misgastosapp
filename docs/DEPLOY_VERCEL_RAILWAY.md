# Guía de Despliegue: Vercel (Frontend) + Railway (Backend)

Sigue estos pasos para poner tu aplicación en producción utilizando la arquitectura recomendada.

## 🚀 Requisitos Previos

- Tener el código subido a un repositorio de **GitHub**.
- Cuentas en: [Vercel](https://vercel.com), [Railway](https://railway.app) y [Supabase](https://supabase.com).

---

## 1. Backend en Railway (Servidor API)

Railway es ideal para servidores Node.js persistentes.

1.  **Nuevo Proyecto**: Entra en Railway, dale a `+ New Project` -> `Deploy from GitHub repo` y selecciona tu repositorio.
2.  **Configurar Carpeta**: 
    - Por defecto Railway intentará ejecutar la raíz. Ve a los **Settings** del servicio generado.
    - En **General**, busca **Root Directory** y cámbialo a `/server`.
3.  **Variables de Entorno (Variables)**:
    Agrega las siguientes variables en la pestaña **Variables**:
    - `PORT`: `3001` (o la que prefieras, Railway la asignará automáticamente si es necesario).
    - `SUPABASE_URL`: Tu URL de Supabase.
    - `SUPABASE_KEY`: Tu clave anon/public de Supabase.
4.  **Comando de Inicio**: 
    - Railway suele detectar `npm start`. Asegúrate de que en `server/package.json` el script "start" sea `node index.js`.
5.  **Dominio**: Railway te dará una URL (ej: `mis-gastos-api.up.railway.app`). **Cópiala**, la necesitarás para el frontend.

---

## 2. Frontend en Vercel (Interfaz React)

Vercel optimizará la entrega de tu sitio estático.

1.  **Importar Proyecto**: En Vercel, dale a `Add New` -> `Project` e importa el mismo repositorio de GitHub.
2.  **Configurar Proyecto**: 
    - **Root Directory**: Haz clic en "Edit" y selecciona la carpeta `client`.
    - **Framework Preset**: Debería detectar **Vite** automáticamente.
3.  **Variables de Entorno**: 
    - Despliega la sección **Environment Variables**.
    - Agrega `VITE_API_URL`.
    - **Valor**: La URL que copiaste de Railway (ej: `https://mis-gastos-api.up.railway.app`).
4.  **Desplegar**: Dale a `Deploy`.

---

## 3. Configuración de Base de Datos (Supabase)

Si aún no lo has hecho:
1.  Crea el proyecto en Supabase.
2.  Ejecuta el script SQL ubicado en `server/db/schema.sql` en el SQL Editor de Supabase para crear las tablas.

---

## 🔗 Resumen de Conexión

- El **Frontend** (Vercel) le habla al **Backend** (Railway) mediante la variable `VITE_API_URL`.
- El **Backend** (Railway) le habla a **Supabase** mediante `SUPABASE_URL` y `SUPABASE_KEY`.

## ⚠️ Notas Importantes
- **CORS**: El servidor en `server/index.js` ya tiene habilitado CORS, lo que permite que el dominio de Vercel pueda hacer consultas a Railway sin problemas.
- **Cambios**: Cada vez que hagas un `git push` a tu rama principal, tanto Vercel como Railway se actualizarán solos.
