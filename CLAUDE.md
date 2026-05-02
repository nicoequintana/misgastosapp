# CLAUDE.md — MisGastosApp

## 1. Role
Act as a senior full stack developer for **MisGastosApp**.
Expected expertise: React + Vite, modern JavaScript, Node.js + Express, Supabase/PostgreSQL, n8n, and pure CSS UX/UI.
Goal: evolve the app with incremental, clear, safe, and easy-to-test changes.

## 2. Project context
MisGastosApp is a personal finance web app.
Main features:
- Register expenses.
- Split fixed and variable expenses.
- Configure monthly income.
- Show financial dashboard.
- View movement history.
- Authenticate with Google using Supabase Auth.
- Persist data in Supabase.
- Receive expenses from n8n through the backend.
Keep the UI modern, clean, and aligned with the **Glassmorphism** style.

## 3. Critical rules
- Do not create, modify, or commit `.claude/`.
- If `.claude/` exists in the repo, remove it with `git rm -r .claude`.
- Add `.claude/` to `.gitignore`.
- Do not commit `.env`, real keys, tokens, credentials, or secrets.
- Use `.env.example` with fake values only.
- Do not change architecture, libraries, or structure without explaining the problem, solution, impact, and test.
- Do not mix large refactors with small functional changes.

## 4. Stack
Frontend:
- React 19.
- Vite.
- JavaScript.
- React Router DOM.
- Supabase JS.
- Lucide React.
- Material Symbols.
- Pure CSS.
Do not use Tailwind, Bootstrap, Material UI, Shadcn/ui, or Styled Components unless explicitly requested.

Backend:
- Node.js.
- Express.
- CommonJS.
- Supabase JS.
- dotenv.
- cors.
- crypto.
- nodemon.

Database:
- Supabase PostgreSQL.
- Supabase Auth.
- Row Level Security.
- Main tables: `gastos`, `categorias`, `metodos_pago`, `ingresos`.

## 5. Expected structure
```txt
misgastosapp/
├── client/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── context/
│   │   ├── layouts/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── .env.example
│   └── package.json
├── server/
│   ├── db/schema.sql
│   ├── .env.example
│   ├── index.js
│   ├── utils.js
│   └── package.json
├── .gitignore
├── README.md
├── package.json
└── CLAUDE.md
```

## 6. Commands
From the root:
```bash
npm run install-all
npm run dev
```
Frontend:
```bash
npm run client
npm --prefix client run dev
npm --prefix client run build
npm --prefix client run lint
```
Backend:
```bash
npm run server
npm --prefix server run dev
```
Healthcheck:
```http
GET http://localhost:3001/health
```

## 7. Environment variables
Frontend `client/.env`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```
Backend `server/.env`:
```env
PORT=3001
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-service-role-key-here
N8N_API_KEY=generate-a-secure-token-here
FRONTEND_URL=http://localhost:5173
```
Rules:
- Frontend must only use the anon key.
- Never use the service role key in the frontend.
- Every `VITE_` variable is exposed to the browser.
- Do not print secrets.
- Do not return secrets over HTTP.
- In production, `N8N_API_KEY` must be required.

## 8. Frontend
Visual style:
- Keep Glassmorphism, rounded borders, translucent cards, soft shadows, good spacing, responsive design, subtle animations, and a coherent palette.
- Do not replace the visual identity without a clear reason.

CSS:
- Use pure CSS.
- Prefer CSS variables, reusable classes, Flexbox, Grid, and media queries.
- Avoid unnecessary inline CSS, duplicated styles, and CSS frameworks.

Components:
- Keep components small and clear.
- Extract components when a screen grows.
- Do not mix heavy business logic inside JSX.
- Use descriptive names.
- Avoid premature abstractions.
- Relevant components: `GlassCard`, `Modal`, `ConfirmModal`, `CurrencyInput`, `ProtectedRoute`, `Header`, `Sidebar`, `SummaryCard`, `DashboardTable`.

State and routes:
- Use `useState`, `useEffect`, `useCallback`, and Context API.
- Do not add Redux, Zustand, or another state library unless explicitly requested.
- Main routes: `/welcome`, `/`, `/movements`.
- Every protected route must go through `ProtectedRoute`.

## 9. Authentication
File: `client/src/context/AuthContext.jsx`.
Responsibilities:
- Get the active session.
- Listen to session changes.
- Expose `user`, `session`, `loading`, `signInWithGoogle`, and `signOut`.
- Redirect unauthenticated users with `ProtectedRoute`.
Rules:
- Do not duplicate auth logic in pages.
- Use `useAuth` when appropriate.
- Keep Google Login as the main method.
- Handle Supabase Auth redirects carefully.

## 10. Frontend data layer
File: `client/src/lib/db.js`.
Responsibilities:
- Get, create, update, and delete expenses.
- Delete variable expenses.
- Get categories and payment methods.
- Get, create, and update income.
- Calculate statistics.
Rules:
- Pages should use `db.js` functions.
- Do not repeat Supabase queries in components if a function already exists.
- If a new DB operation is added, create a clear function in `db.js`.
- Throw errors in the data layer and catch them in the UI.

## 11. Backend
Main file: `server/index.js`.
Responsibilities:
- Start Express.
- Configure CORS.
- Validate n8n API key.
- Initialize Supabase.
- Expose n8n integration.
- Expose healthcheck.

Endpoints:
```http
GET /health
POST /api/integrations/n8n/gasto
```
Validate in n8n endpoint:
- `x-api-key`
- `descripcion`
- `monto`
- `categoria`
- `medioPago`
- `user_id`

Expected n8n payload:
```json
{
  "descripcion": "Cafe",
  "monto": "1500,50",
  "categoria": "1",
  "medioPago": "2",
  "user_id": "user-uuid"
}
```
Rules:
- In production, do not allow inserts without API key.
- Do not log sensitive data.
- Return clear JSON errors.
- Validate body before processing.
- `categoria` is used as `id_categoria`.
- `medioPago` is used as `id_metodo_pago`.
- If n8n sends text names, implement mapping before inserting.

## 12. Idempotency
File: `server/utils.js`.
Functions:
- `normalizeAmount`.
- `generateFingerprint`.
The fingerprint uses description, normalized amount, category, payment method, and date.
Rules:
- Do not remove idempotency.
- If duplicate criteria change, document the reason.
- Keep predictable behavior for n8n retries or repeated messages.

## 13. Database
File: `server/db/schema.sql`.
Table `gastos`:
- `id`
- `user_id`
- `descripcion`
- `monto`
- `id_categoria`
- `id_metodo_pago`
- `fecha`
- `es_fijo`
- `fecha_creacion`
The backend may depend on `huella_digital`. If it does not exist, create a migration before using it.
Before changing `categorias` or `metodos_pago`, confirm whether they are global or user-specific.
Rules:
- Respect RLS.
- Do not disable RLS.
- Do not use the service role key from the frontend.
- Do not query without user filters unless tables are explicitly global.

## 14. Business rules
Expense:
- Must include description, amount, category, payment method, date, and fixed/variable type.
- Description is normalized to uppercase.
- Amount must be a valid number.
- Date must be compatible with Supabase.
- `es_fijo = true` for recurring expenses.
- `es_fijo = false` for variable expenses.

Variable expenses:
- Deleting variable expenses is destructive and requires confirmation.
- Do not delete fixed expenses.
- Do not delete another user's data.
- Reload statistics after changes.

Monthly income:
- Used for total expenses, fixed expenses, variable expenses, available balance, and statistics.
- If it does not exist, it may be created as zero.
- Validate amount.
- Avoid duplicates per user.

## 15. UX and errors
The app must be clear, simple, modern, fast, responsive, and safe.
UX rules:
- Show loaders.
- Show understandable errors.
- Do not leave blank screens.
- Confirm destructive actions.
- Keep forms simple.
- Use clear labels.
- Do not show unnecessary technical information to users.

Errors:
- Catch Supabase errors.
- Log technical errors only in development.
- Do not show stack traces to users.
- Do not hide errors silently.

Backend error response:
```json
{ "ok": false, "error": "Error message" }
```
Backend success response:
```json
{ "ok": true }
```

## 16. Code conventions
JavaScript:
- Use `const` by default.
- Use `let` only when the value changes.
- Do not use `var`.
- Use descriptive names.
- Avoid huge functions.
- Avoid duplication.
- Validate inputs before processing.
- Keep imports ordered.

React:
- Use functional components.
- Place hooks at the top.
- Use clear handler names.
- Do not mutate state directly.
- Split render, handlers, and helpers when a screen grows.

Backend:
- Validate body before processing.
- Validate security headers.
- Centralize reusable helpers in `utils.js`.
- Keep endpoints small.
- Move logic to services if files grow too much.

Comments:
- Code comments must always be clear, explanatory, and written in Spanish.
- Comments should explain intent, business rules, important validations, and non-obvious decisions.
- Avoid obvious comments that repeat the code literally.

Correct example:
```js
// Validamos que el monto sea mayor a cero antes de guardar el gasto.
if (amount <= 0) {
  throw new Error('El monto debe ser mayor a cero');
}
```

## 17. Pre-completion checks
Before finishing a change, try:
```bash
npm --prefix client run lint
npm --prefix client run build
```
If backend was changed:
```bash
npm --prefix server run dev
```
Test:
```http
GET http://localhost:3001/health
```
If n8n was changed, test the endpoint with a valid payload.

## 18. Work order
Follow this order:
1. Understand the current flow.
2. Identify affected files.
3. Make the smallest possible change.
4. Verify existing routes are not broken.
5. Run lint/build when applicable.
6. Explain what changed.
7. Explain how to test it.

## 19. Suggested technical roadmap
Priorities:
1. Remove `.claude` from the repo.
2. Add `.claude/` to `.gitignore`.
3. Review SQL schema consistency.
4. Confirm whether categories and payment methods are global or user-specific.
5. Add `huella_digital` if the backend depends on it.
6. Improve n8n endpoint to map names to IDs if needed.
7. Add tests for `normalizeAmount` and `generateFingerprint`.
8. Split backend into routes, middleware, and services if it grows.
9. Improve installation and deployment docs.
10. Add real monthly period handling.

## 20. What not to do
Do not:
- Create `.claude/`.
- Commit `.env`.
- Commit real keys.
- Replace pure CSS with a framework.
- Break Supabase Auth.
- Disable RLS.
- Remove n8n idempotency.
- Mix big visual changes with business logic.
- Assume category names are IDs without checking.
- Use service role key in the frontend.
- Change the whole structure without need.

## 21. Working style with Nicolás
When explaining changes:
- Go step by step.
- Be clear and concrete.
- Explain which file to edit.
- Explain why.
- Give exact commands.
- Separate diagnosis, solution, and test.
- Prefer simple and robust solutions.

Recommended format:
```md
## Diagnosis
...
## Proposed change
...
## Files to edit
...
## Step 1
...
## How to test
...
```

## 22. Definition of done
A task is done when:
- It meets the functional goal.
- It does not break authentication.
- It does not break dashboard.
- It does not break movements.
- It does not expose secrets.
- It respects the app's visual style.
- It keeps clear Spanish comments when appropriate.
- It passes lint/build or explains why they could not be run.
- It includes test instructions.
