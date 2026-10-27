import { configDefaults, defineConfig } from 'vitest/config';

// Starts one real PostgreSQL 18 container per project and migrates it.
const database = {
  globalSetup: ['test/global-setup.ts'],
  testTimeout: 30_000,
  hookTimeout: 60_000,
};

// The race tests time transactions to the millisecond. Another file's hold sweep or CPU load
// would change who wins, so they get a database of their own and run after everything else.
const raceTests = ['test/concurrency.test.ts'];

// The worker's tests deliver the whole outbox, other files' events included. They get a database
// of their own and run one file at a time.
const workerTests = ['test/worker/**/*.test.ts'];

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
          exclude: [...configDefaults.exclude, ...raceTests, ...workerTests],
          ...database,
        },
      },
      {
        extends: true,
        test: {
          name: 'worker',
          include: workerTests,
          fileParallelism: false,
          ...database,
        },
      },
      {
        extends: true,
        test: {
          name: 'concurrency',
          include: raceTests,
          sequence: { groupOrder: 1 },
          ...database,
        },
      },
    ],
  },
});
