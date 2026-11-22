import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@tabax/core/federation': path.resolve(__dirname, '../../packages/core/src/federation/index.ts'),
      '@tabax/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@tabax/view-2d': path.resolve(__dirname, '../../packages/view-2d/src/index.ts'),
      '@tabax/view-3d': path.resolve(__dirname, '../../packages/view-3d/src/index.ts'),
    },
  },
});
