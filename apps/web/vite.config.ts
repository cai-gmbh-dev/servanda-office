import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          // Inject dev-mode auth headers (Musterkanzlei admin)
          proxy.on('proxyReq', (proxyReq) => {
            if (!proxyReq.getHeader('x-tenant-id')) {
              proxyReq.setHeader('x-tenant-id', '00000000-0000-0000-0000-000000000002');
              proxyReq.setHeader('x-user-id', '00000000-0000-0000-0002-000000000001');
              proxyReq.setHeader('x-user-role', 'admin');
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
