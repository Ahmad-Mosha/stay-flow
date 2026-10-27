import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests run server-side; resolve workspace packages to their TypeScript source, like tsc does.
  ssr: { resolve: { conditions: ['@stay-flow/source'] } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.test.ts'],
          // Starts one real PostgreSQL 18 container for the whole run and migrates it.
          globalSetup: ['test/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
