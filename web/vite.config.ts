import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VaatsalyaKitchens storefront deploys at the domain root, so base is '/'.
// In dev, /api is proxied to the PHP API server that runs WITH the router
// (php -S localhost:8081 router.php) — 8080 runs the old app without a router.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})