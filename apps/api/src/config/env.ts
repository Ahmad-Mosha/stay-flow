import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/**
 * Every environment variable the API reads. Parsing happens once at startup, so a
 * misconfigured deployment fails immediately instead of on the first request that
 * needs the missing value.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'must be a postgres:// connection URL',
  }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),
});

export type LogLevel = (typeof logLevels)[number];

export interface DatabaseConfig {
  readonly url: string;
  readonly poolMax: number;
  readonly statementTimeoutMs: number;
}

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly database: DatabaseConfig;
}

export class InvalidConfigError extends Error {
  override readonly name = 'InvalidConfigError';
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // prettifyError lists variable names and rules, never the values, so secrets stay out of logs.
    throw new InvalidConfigError(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }

  const parsed = result.data;
  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    database: {
      url: parsed.DATABASE_URL,
      poolMax: parsed.DATABASE_POOL_MAX,
      statementTimeoutMs: parsed.DATABASE_STATEMENT_TIMEOUT_MS,
    },
  };
}
