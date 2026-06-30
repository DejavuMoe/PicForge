import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts'],
    coverage: {
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/node_modules/**'],
    },
  },
});
