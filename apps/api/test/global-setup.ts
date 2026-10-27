import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { withMigrationConnection } from './support/database.js';
import { migrateToLatest } from '../src/platform/database/migrator.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

// Same version as compose.yaml.
const POSTGRES_IMAGE = 'postgres:18.6-alpine';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const databaseUrl = container.getConnectionUri();

  await withMigrationConnection(databaseUrl, migrateToLatest);
  project.provide('databaseUrl', databaseUrl);

  return async () => {
    await container.stop();
  };
}
