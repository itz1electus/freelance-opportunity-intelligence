import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_ORIGIN = 'http://127.0.0.1:4311';

// Development only (SEC-10): the dev server listens on loopback, accepts only the
// canonical host, and proxies /api with the Origin FOI expects. Daily use runs the
// production build served by the FOI server.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['127.0.0.1'],
    cors: false,
    proxy: {
      '/api': {
        target: API_ORIGIN,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (proxyReq.getHeader('origin')) proxyReq.setHeader('origin', API_ORIGIN);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // Keep the build free of inline scripts so the strict CSP holds.
    modulePreload: { polyfill: false },
  },
});
