import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    pool: 'threads',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'json', 'text'],
      reportsDirectory: '../../coverage',
      exclude: ['node_modules/**', 'dist/**', 'tests/**'],
    },
  },
});
