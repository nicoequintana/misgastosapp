# =============================================
# STAGE 1: Build del frontend (React + Vite)
# =============================================
FROM node:20-alpine AS builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./

# Las variables de build se inyectan como build args
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# =============================================
# STAGE 2: Servidor Express (sirve API + estáticos)
# =============================================
FROM node:20-alpine AS production

WORKDIR /app

# Instalar dependencias del servidor
COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./

# Copiar el build del frontend al servidor
COPY --from=builder /app/client/dist ./public

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "index.js"]