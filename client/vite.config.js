import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
    coverage: { reporter: ['text'] },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'Tus Gastos - Control Personal',
        short_name: 'Tus Gastos',
        description: 'Registrá y controlá tus gastos personales',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Toma control inmediato al detectar nueva versión — evita que chunks viejos queden cacheados
        skipWaiting: true,
        clientsClaim: true,
        // Cachea assets estáticos del build
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // La fuente variable de Material Symbols (todos los íconos, self-hosted) pesa ~4MB —
        // supera el límite default de 2MB. Se descarga una sola vez y queda cacheada localmente.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Estrategia network-first para rutas de la app (requiere auth activa)
        navigateFallback: '/index.html',
        // Excluir el callback OAuth — el SW no debe interceptar URLs con ?code=
        // Si lo hace, el SDK de Supabase no puede procesar el code PKCE y el login falla.
        navigateFallbackDenylist: [/\?code=/, /\?error=/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  base: '/',
  server: {
    historyApiFallback: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})