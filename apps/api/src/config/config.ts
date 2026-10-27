import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof logLevels)[number];

export interface DatabaseConfig {
  readonly url: string;
  readonly poolMax: number;
  readonly statementTimeoutMs: number;
}

export interface HoldsConfig {
  /** How often expired holds are swept; 0 turns the sweeper off. */
  readonly sweepIntervalMs: number;
}

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly database: DatabaseConfig;
  readonly holds: HoldsConfig;
}

export class InvalidConfigError extends Error {
  override readonly name = 'InvalidConfigError';
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'must be a postgres:// connection URL',
  }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),
  HOLD_SWEEP_INTERVAL_MS: z.coerce.number().int().min(0).default(30_000),
});

/** Parses the environment once at startup, so a bad deployment fails before serving traffic. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // prettifyError names the variables but never prints their values.
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
    holds: {
      sweepIntervalMs: parsed.HOLD_SWEEP_INTERVAL_MS,
    },
  };
}
