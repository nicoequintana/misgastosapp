# 🚀 Prompt de Desarrollo — Etapa 3 — Autenticación con Google

## 🎯 Objetivo
Implementar una vista de bienvenida (`/welcome`) y un sistema de autenticación obligatoria utilizando **Supabase Auth (Google OAuth 2.0)**. 

La aplicación debe ser inaccesible para usuarios no autenticados, protegiendo todas las rutas privadas y manteniendo la estética premium y la robustez técnica desarrollada en las etapas anteriores.

---

## 🧱 Alcance Técnico

### 📌 Vista de Bienvenida (`/welcome`)
- **Diseño:** Crear una página inicial con estética "Glassmorphism", coherente con el resto de la app (fondos oscuros, desenfoques, tipografía moderna).
- **Interacción:** Un único botón centralizado: "Continuar con Google".
- **Estado:** Mostrar estados de carga (spinners o skeletons) mientras se procesa la autenticación.

### 🛡️ Protección de Rutas (Middleware/Guard)
- **Componente `ProtectedRoute`:** Crear un wrapper en React que verifique la existencia de una sesión de Supabase.
- **Redirección:** 
  - Si un usuario no autenticado intenta acceder a `/`, `/movimientos`, `/informes`, etc. → Redirigir a `/welcome`.
  - Si un usuario ya autenticado intenta acceder a `/welcome` → Redirigir al Dashboard (`/`).

### 🔑 Integración con Supabase Auth
- **Cliente Frontend:** Configurar `supabase-js` en el cliente para manejar `auth.signInWithOAuth`.
- **Sesión Persistente:** Configurar el cliente para que la sesión se recupere automáticamente del localStorage/cookies al recargar la página.
- **Log Out:** (Opcional pero recomendado) Añadir un botón de "Cerrar Sesión" en la configuración o el layout principal.

---

## 🚨 Restricciones Críticas
- ❌ **No permitir registro manual:** Por esta fase, solo se permite el login vía Google.
- ❌ **Seguridad:** No exponer `SUPABASE_SERVICE_ROLE_KEY` en el frontend, usar siempre la `ANON_KEY`.
- ❌ **Estabilidad:** El flujo de integración de n8n (Etapa 2) no debe romperse. Los datos persistidos deben seguir siendo accesibles.
- ❌ **Modo Mock:** La autenticación de Google requiere un backend real. El modo mock debe ser desactivado o manejado con una sesión "fake" pre-aprobada solo para desarrollo local si no hay internet (aunque se prioriza el uso de Supabase real para esta fase).

---

## 🧪 Verificación Obligatoria
- ✅ **Flujo de redirección:** Validar que al entrar "limpio" a la URL base, la app me lleve a `/welcome`.
- ✅ **Auth de Google:** Validar que tras el popup/redirección de Google, el usuario regrese a la app y vea sus datos.
- ✅ **Persistencia:** Validar que al cerrar la pestaña y volver a abrirla, el usuario siga logueado.
- ✅ **UIs Responsivas:** La vista de bienvenida debe verse perfecta en móviles y desktop.

---

## 🧠 Contexto de Arquitectura
- **Frontend:** React 19, Vite, React Router 7.
- **Backend:** Express (ya configurado con Supabase).
- **Estilos:** Vanilla CSS (Glassmorphism).

---

Desarrollar esta fase manteniendo el estándar de código limpio y modular que define al proyecto.
