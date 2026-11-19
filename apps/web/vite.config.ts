import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
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
          if (id.includes('node_modules/three')) {
            return 'three';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
});
