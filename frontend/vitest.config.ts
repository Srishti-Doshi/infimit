/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Separate from vite.config.ts so test setup doesn't leak into the
 * production build (e.g., the `test` field, MSW server import, jest-dom).
 *
 * Mirrors vite.config.ts for plugin + alias so import resolution matches.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules', 'dist', 'src/mocks', 'src/test', '**/*.config.*'],
    },
  },
});
