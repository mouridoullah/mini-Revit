import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: process.env.BASE_URL || '/',
  plugins: [
    react(),
    {
      name: 'web-drop-unused-core-federation-re-export',
      enforce: 'pre',
      transform(source, id) {
        if (!id.replace(/\\/g, '/').endsWith('/packages/core/src/index.ts')) return null;
        // The web app imports IFC federation from its lazy subpath. Remove the
        // otherwise-unused runtime barrel edge in this bundle only, leaving core untouched.
        return {
          code: source.replace(/^export \* as Federation from '\.\/federation\/index\.js';\r?\n/m, ''),
          map: null,
        };
      },
    },
  ],
  resolve: {
    alias: {
      '@tabax/core/federation': path.resolve(__dirname, '../../packages/core/src/federation/index.ts'),
      '@tabax/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@tabax/view-2d': path.resolve(__dirname, '../../packages/view-2d/src/index.ts'),
      '@tabax/view-3d': path.resolve(__dirname, '../../packages/view-3d/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  build: {
    target: 'esnext',
    // Sur runner CI / Linux, minification esbuild maximale. Sur Windows local, désactivé pour parer
    // aux verrous de fichiers temporaires OS (EPERM / Access is denied sur AppData\Local\Temp\esbuild-*).
    minify: process.env.CI || process.platform !== 'win32' ? 'esbuild' : false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (id.includes('node_modules/three')) {
            return 'three';
          }
          if (normalizedId.includes('/packages/core/src/clash/')) {
            return 'core-clash';
          }
          if (normalizedId.includes('/packages/core/src/federation/')) {
            return 'ifc-domain';
          }
          if (normalizedId.includes('/packages/view-3d/src/')) {
            return 'view-3d';
          }
          if (normalizedId.includes('/packages/view-2d/src/')) {
            return 'view-2d';
          }
          if (normalizedId.includes('/packages/geometry/src/')) {
            return 'geometry';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
});
