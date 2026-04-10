import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://evidentis:test_password@localhost:5432/evidentis_test',
      REDIS_URL: 'redis://localhost:6379',
    },
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'text'],
      reportsDirectory: '../../coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        'src/seed.ts',
      ],
    },
  },
});
