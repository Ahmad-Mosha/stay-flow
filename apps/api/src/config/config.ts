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

export interface HttpConfig {
  /** Proxies in front of the API whose X-Forwarded-For entries are trusted to name the client. */
  readonly trustProxyHops: number;
  /** Browser origins, besides the API's own, allowed to send state-changing requests. */
  readonly trustedOrigins: readonly string[];
}

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly http: HttpConfig;
  readonly database: DatabaseConfig;
  readonly holds: HoldsConfig;
}

export class InvalidConfigError extends Error {
  override readonly name = 'InvalidConfigError';
}

const originSchema = z
  .url()
  .refine((url) => new URL(url).origin === url, 'must be origins like https://app.example.com');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  TRUSTED_ORIGINS: z
    .string()
    .default('')
    .transform((list) =>
      list
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(originSchema)),
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
    http: {
      trustProxyHops: parsed.TRUST_PROXY_HOPS,
      trustedOrigins: parsed.TRUSTED_ORIGINS,
    },
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
