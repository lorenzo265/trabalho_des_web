import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// O front chama `/api` na mesma origem; em desenvolvimento o Vite repassa para a API (sem CORS,
// cookie de sessão SameSite=Strict funciona e o Origin bate com o Host).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://localhost:3001', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
