import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    // Integration tests open real SQLite files in temporary directories.
    fileParallelism: true,
  },
});
