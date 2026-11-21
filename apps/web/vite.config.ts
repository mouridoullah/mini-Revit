import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
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
      '@mini-bim/core/federation': path.resolve(__dirname, '../../packages/core/src/federation/index.ts'),
      '@mini-bim/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@mini-bim/view-2d': path.resolve(__dirname, '../../packages/view-2d/src/index.ts'),
      '@mini-bim/view-3d': path.resolve(__dirname, '../../packages/view-3d/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  build: {
    target: 'esnext',
    minify: false,
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
