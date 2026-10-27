import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import type { AppError } from '../src/platform/errors/app-error.js';
import { type RateLimit, RateLimiter } from '../src/platform/rate-limit/rate-limiter.js';
import { connectTestDatabase } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('RateLimiter', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;
  let limiter: RateLimiter;

  beforeAll(async () => {
    app = await createTestApp();
    limiter = app.get(RateLimiter);
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  const newRule = (limit: number): RateLimit => ({
    name: `test-${randomUUID()}`,
    limit,
    windowSeconds: 60,
  });

  it('lets exactly the limit through when requests arrive at once', async () => {
    const rule = newRule(5);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => limiter.consume(rule, 'client')),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    for (const result of results.filter((result) => result.status === 'rejected')) {
      const error = result.reason as AppError;
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.headers['Retry-After']).toMatch(/^\d+$/);
    }
  });

  it('counts each subject on its own', async () => {
    const rule = newRule(1);
    await limiter.consume(rule, 'first');

    await expect(limiter.consume(rule, 'second')).resolves.toBeUndefined();
    await expect(limiter.consume(rule, 'first')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('starts counting again when the window has passed', async () => {
    const rule = newRule(1);
    await limiter.consume(rule, 'client');
    await expect(limiter.consume(rule, 'client')).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    await db
      .updateTable('rateLimits')
      .set({ windowStart: new Date(Date.now() - 61_000) })
      .where('key', '=', `${rule.name}:client`)
      .execute();

    await expect(limiter.consume(rule, 'client')).resolves.toBeUndefined();
  });
});
