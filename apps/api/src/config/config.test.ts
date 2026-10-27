import { describe, expect, it } from 'vitest';
import { InvalidConfigError, loadConfig } from './config.js';

const validEnv = { DATABASE_URL: 'postgres://user:secret@localhost:5432/stayflow' };

describe('loadConfig', () => {
  it('applies defaults when only the required variables are set', () => {
    expect(loadConfig(validEnv)).toEqual({
      env: 'development',
      port: 3000,
      logLevel: 'info',
      http: {
        trustProxyHops: 0,
        trustedOrigins: [],
      },
      database: {
        url: validEnv.DATABASE_URL,
        poolMax: 10,
        statementTimeoutMs: 5_000,
      },
      holds: {
        sweepIntervalMs: 30_000,
      },
    });
  });

  it('coerces numeric variables from strings', () => {
    const config = loadConfig({ ...validEnv, PORT: '8080', DATABASE_POOL_MAX: '25' });

    expect(config.port).toBe(8080);
    expect(config.database.poolMax).toBe(25);
  });

  it('reads trusted origins as a comma-separated list of origins', () => {
    const config = loadConfig({
      ...validEnv,
      TRUSTED_ORIGINS: 'https://stayflow.example, http://localhost:3001',
    });

    expect(config.http.trustedOrigins).toEqual([
      'https://stayflow.example',
      'http://localhost:3001',
    ]);
    expect(() =>
      loadConfig({ ...validEnv, TRUSTED_ORIGINS: 'https://stayflow.example/app' }),
    ).toThrow(/TRUSTED_ORIGINS/);
  });

  it('rejects a missing DATABASE_URL and names the variable', () => {
    expect(() => loadConfig({})).toThrow(InvalidConfigError);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a connection URL for another database', () => {
    expect(() => loadConfig({ DATABASE_URL: 'mysql://localhost/stayflow' })).toThrow(
      /must be a postgres:\/\/ connection URL/,
    );
  });

  it('rejects an out-of-range port', () => {
    expect(() => loadConfig({ ...validEnv, PORT: '70000' })).toThrow(/PORT/);
  });

  it('never echoes variable values in the error message', () => {
    const secretUrl = 'mysql://admin:hunter2@db.internal/stayflow';

    let message = '';
    try {
      loadConfig({ DATABASE_URL: secretUrl });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('hunter2');
  });
});
