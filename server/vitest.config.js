import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup-network-guard.js'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
