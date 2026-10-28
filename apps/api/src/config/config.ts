import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof logLevels)[number];

export interface DatabaseConfig {
  readonly url: string;
  readonly poolMax: number;
  readonly statementTimeoutMs: number;
}

export interface HttpConfig {
  /** Proxies in front of the API whose X-Forwarded-For entries are trusted to name the client. */
  readonly trustProxyHops: number;
  /** Browser origins, besides the API's own, allowed to send state-changing requests. */
  readonly trustedOrigins: readonly string[];
  /**
   * How long a stopping API keeps serving after it reports not ready, for the load balancer to
   * stop sending it traffic. 0 suits a single instance; Kubernetes needs a few seconds.
   */
  readonly drainDelayMs: number;
  /** How long a stopping API waits for the requests in flight before it cuts them off. */
  readonly shutdownTimeoutMs: number;
}

/** The pause between runs of each of the worker's jobs. 0 turns a job off, so tests run it. */
export interface JobsConfig {
  /** Expiring lapsed holds. */
  readonly holdSweepIntervalMs: number;
  /** Marking missed arrivals as no-shows. */
  readonly nightAuditIntervalMs: number;
  /** Deleting expired sessions, guest links, idempotency keys and other short-lived rows. */
  readonly housekeepingIntervalMs: number;
}

export interface MailConfig {
  /** Such as `smtp://localhost:1025`, Mailpit in development. */
  readonly smtpUrl: string;
  /** The sender, such as `Stay Flow <bookings@stayflow.test>`. */
  readonly from: string;
  /** The website guests use, for the links in emails. */
  readonly webUrl: string;
}

export interface MetricsConfig {
  /** Where the API serves /metrics. Unset serves none. */
  readonly apiPort: number | undefined;
  /** Where the worker serves /metrics. A port of its own, as both may run on one host. */
  readonly workerPort: number | undefined;
}

export interface OutboxConfig {
  /** How long the worker waits when no event is due; 0 stops the loop, so tests drain it. */
  readonly pollIntervalMs: number;
  /** How many events the worker claims at a time. */
  readonly batchSize: number;
  /** How long a claimed event stays hidden from other workers. A worker that dies gives it back then. */
  readonly leaseMs: number;
}

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly http: HttpConfig;
  readonly database: DatabaseConfig;
  readonly jobs: JobsConfig;
  readonly mail: MailConfig;
  readonly metrics: MetricsConfig;
  readonly outbox: OutboxConfig;
}

export class InvalidConfigError extends Error {
  override readonly name = 'InvalidConfigError';
}

const originSchema = z
  .url()
  .refine((url) => new URL(url).origin === url, 'must be origins like https://app.example.com');

// Unset or empty serves nothing. 0 picks any free port, which tests use.
const optionalPort = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().min(0).max(65_535).optional(),
);

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
  SHUTDOWN_DRAIN_DELAY_MS: z.coerce.number().int().min(0).default(0),
  // Longer than the statement timeout, so a request is not cut off while its query can finish.
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(0).default(10_000),
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'must be a postgres:// connection URL',
  }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),
  HOLD_SWEEP_INTERVAL_MS: z.coerce.number().int().min(0).default(30_000),
  NIGHT_AUDIT_INTERVAL_MS: z.coerce.number().int().min(0).default(300_000),
  HOUSEKEEPING_INTERVAL_MS: z.coerce.number().int().min(0).default(3_600_000),
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).default('smtp://localhost:1025'),
  MAIL_FROM: z.string().trim().min(3).default('Stay Flow <bookings@stayflow.test>'),
  WEB_URL: originSchema.default('http://localhost:3001'),
  METRICS_PORT: optionalPort,
  WORKER_METRICS_PORT: optionalPort,
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(0).default(1_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(20),
  // Longer than the mailer's timeouts, so a slow send is never taken over while it runs.
  OUTBOX_LEASE_MS: z.coerce.number().int().min(100).default(60_000),
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
      drainDelayMs: parsed.SHUTDOWN_DRAIN_DELAY_MS,
      shutdownTimeoutMs: parsed.SHUTDOWN_TIMEOUT_MS,
    },
    database: {
      url: parsed.DATABASE_URL,
      poolMax: parsed.DATABASE_POOL_MAX,
      statementTimeoutMs: parsed.DATABASE_STATEMENT_TIMEOUT_MS,
    },
    jobs: {
      holdSweepIntervalMs: parsed.HOLD_SWEEP_INTERVAL_MS,
      nightAuditIntervalMs: parsed.NIGHT_AUDIT_INTERVAL_MS,
      housekeepingIntervalMs: parsed.HOUSEKEEPING_INTERVAL_MS,
    },
    mail: {
      smtpUrl: parsed.SMTP_URL,
      from: parsed.MAIL_FROM,
      webUrl: parsed.WEB_URL,
    },
    metrics: {
      apiPort: parsed.METRICS_PORT,
      workerPort: parsed.WORKER_METRICS_PORT,
    },
    outbox: {
      pollIntervalMs: parsed.OUTBOX_POLL_INTERVAL_MS,
      batchSize: parsed.OUTBOX_BATCH_SIZE,
      leaseMs: parsed.OUTBOX_LEASE_MS,
    },
  };
}
