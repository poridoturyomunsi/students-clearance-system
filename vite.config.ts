import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import fs from 'fs';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'build',
      emptyOutDir: true,
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      // Proxy API requests to the backend server running on the development machine.
      // This ensures mobile devices that load the Vite dev server (via the host's IP)
      // will have their `/api` requests forwarded correctly to the local backend.
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
          router: () => {
            try {
              const portPath = path.resolve(__dirname, '.port');
              if (fs.existsSync(portPath)) {
                const port = fs.readFileSync(portPath, 'utf8').trim();
                if (port) {
                  return `http://localhost:${port}`;
                }
              }
            } catch (e) {
              // ignore
            }
            return 'http://localhost:3000';
          },
          rewrite: (path) => path,
        },
      },
      hmr: process.env.DISABLE_HMR === 'true' ? false : {
        protocol: 'ws',
        host: process.env.HMR_HOST || 'localhost',
        port: 5173,
      },
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
            ignored: [
              '**/dist-build/**',
              '**/dist/**',
              '**/build/**',
            ],
          },
    },
  };
});