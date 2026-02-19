# Mis Gastos - App de Control Financiero Personal 💰

Una plataforma web premium para la gestión de finanzas personales, diseñada con una estética moderna de **Glassmorphism** y un enfoque en la simplicidad y la experiencia de usuario de alta fidelidad.

---

## 🌟 Visión del Proyecto
**Mis Gastos** nació para ofrecer una herramienta visualmente atractiva y técnicamente robusta que permita a los usuarios tener control absoluto sobre sus flujos de caja mensuales, diferenciando claramente entre compromisos fijos y gastos variables.

---

## 🛠 Arquitectura y Tecnologías

### Frontend (Modern SPA)
- **React 19 (Vite):** Base del ecosistema interactivo.
- **Pure CSS Mastery:** Arquitectura de estilos basada en **Custom Properties (Variables CSS)**, Flexbox y Grid. **Totalmente libre de frameworks de CSS (Zero Tailwind/Bootstrap)** para máximo rendimiento y personalización.
- **Glassmorphism Design:** Uso intensivo de `backdrop-filter`, transparencias y efectos de desenfoque gaussianos.
- **Lucide & Material Symbols:** Iconografía vectorial limpia.

### Backend (Robust API)
- **Node.js + Express:** API centralizada para la manipulación de datos.
- **Supabase Integration:** Persistencia de datos en la nube mediante PostgreSQL.
- **Mock Persistence Mode:** Fallback automático a base de datos en memoria para entornos de desarrollo sin conexión a la nube.

---

## ✨ Funcionalidades Principales

### 📊 Dashboard Inteligente
Visualización en tiempo real de 4 indicadores clave:
1. **Ingresos Mensuales:** Presupuesto base configurado por el usuario.
2. **Gasto Total:** Suma dinámica de todos los movimientos registrados.
3. **Saldo Disponible:** Cálculo neto instantáneo.
4. **Ahorro Estimado:** Proyección automática basada en el **20%** de ahorro sugerido.

### 📋 Gestión Dual de Gastos
El sistema separa los gastos en dos categorías fundamentales:
- **Gastos Variables:** Movimientos espontáneos del mes.
- **Gastos Fijos:** Compromisos recurrentes (Alquiler, Servicios, etc.) que se visualizan en su propia tabla dedicada.

### 🎨 Categorización Dinámica
- **Entrada de Texto Libre:** No hay límites de categorías predefinidas.
- **Algoritmo de Colores:** Cada categoría recibe automáticamente un estilo visual (Tags de color) basado en su nombre, permitiendo una clasificación visual rápida y elegante.

### ⚙️ Operaciones CRUD Completas
- **Crear/Editar:** Modal premium con validaciones de campos (Descripción, Monto, Categoría, Fecha, Medio de Pago).
- **Eliminar:** Sistema de seguridad con **ConfirmModal Glassmorphism** para evitar borrados accidentales sin romper la estética del sitio.

### 🤖 Integración Automatizada (n8n / WhatsApp)
La app cuenta con un endpoint especializado para recibir gastos desde flujos de automatización:
- **Endpoint:** `POST /api/integrations/n8n/gasto`
- **Características:**
  - **Normalización:** Convierte automáticamente montos con coma (,) a decimales válidos.
  - **Idempotencia (Anti-Duplicados):** Sistema de fingerprint que evita cargar el mismo gasto si se reenvía el mensaje el mismo día.
  - **Payload:** `{ "descripcion": "...", "monto": "...", "categoria": "...", "medioPago": "..." }`

---

## 🚀 Guía de Instalación y Uso

### Prerrequisitos
- Node.js (v18 o superior)
- NPM o Yarn

### Paso a Paso

1. **Instalación Limpia:**
   Ejecuta el siguiente comando en la raíz para instalar dependencias de cliente y servidor:
   ```bash
   npm install
   ```

2. **Configurar el Backend:**
   El archivo de configuración de base de datos se encuentra en `server/db/schema.sql`.
   Crear un archivo `.env` en la carpeta `server` con tus credenciales de Supabase:
   ```env
   PORT=3001
   SUPABASE_URL=tu_url_aqui
   SUPABASE_KEY=tu_anon_key_aqui
   ```
   *Nota: Si no se configuran, la app iniciará en **Mock Mode** (Datos volátiles en memoria).*

3. **Lanzar la aplicación:**
   Desde la raíz del proyecto:
   ```bash
   npm run dev
   ```
   Esto iniciará concurrentemente:
   - **Cliente (Vite):** [http://localhost:5173](http://localhost:5173)
   - **Servidor (Express):** [http://localhost:3001](http://localhost:3001)

---

## 📂 Estructura del Proyecto

- **/client**: Código fuente del frontend (React + Vite).
- **/server**: Código fuente del backend (Express).
  - **/db**: Esquemas SQL y migraciones.
- **/docs**: Documentación adicional, workflows de n8n y prompts de contexto.

---

## 👤 Autor
Proyecto desarrollado para **Nicolas Ezequiel Quintana**.
