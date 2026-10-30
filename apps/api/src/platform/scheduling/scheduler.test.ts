import type { PinoLogger } from 'nestjs-pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Metrics } from '../metrics/metrics.js';
import { type ScheduledJob, Scheduler } from './scheduler.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Scheduler', () => {
  const logger = { setContext: vi.fn(), error: vi.fn() };
  let scheduler: Scheduler | undefined;
  let metrics: Metrics;

  afterEach(async () => {
    await scheduler?.beforeApplicationShutdown();
    scheduler = undefined;
    vi.clearAllMocks();
  });

  function start(...jobs: ScheduledJob[]): Scheduler {
    metrics = new Metrics();
    scheduler = new Scheduler(jobs, metrics, logger as unknown as PinoLogger);
    scheduler.onApplicationBootstrap();
    return scheduler;
  }

  it('runs a job at startup, then again after each pause', async () => {
    let runs = 0;
    start({
      name: 'count',
      intervalMs: 10,
      run: () => {
        runs++;
        return Promise.resolve();
      },
    });

    await sleep(0);
    expect(runs).toBe(1);
    await expect.poll(() => runs).toBeGreaterThanOrEqual(3);
  });

  it('never starts a run before the last one has ended', async () => {
    let running = 0;
    let most = 0;
    let runs = 0;
    start({
      name: 'slow',
      intervalMs: 1,
      run: async () => {
        running++;
        most = Math.max(most, running);
        await sleep(15);
        running--;
        runs++;
      },
    });

    await expect.poll(() => runs).toBeGreaterThanOrEqual(3);
    expect(most).toBe(1);
  });

  it('leaves a job with no pause turned off', async () => {
    const run = vi.fn(() => Promise.resolve());
    start({ name: 'off', intervalMs: 0, run });

    await sleep(20);
    expect(run).not.toHaveBeenCalled();
  });

  it('logs a failed run and keeps the job going', async () => {
    let runs = 0;
    start({
      name: 'flaky',
      intervalMs: 5,
      run: () => {
        runs++;
        return runs === 1 ? Promise.reject(new Error('Database is down')) : Promise.resolve();
      },
    });

    await expect.poll(() => runs).toBeGreaterThanOrEqual(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'flaky' }),
      'Scheduled job failed',
    );
  });

  it('times every run, and records when the job last succeeded', async () => {
    let runs = 0;
    start({
      name: 'flaky',
      intervalMs: 1,
      run: () => {
        runs++;
        return runs === 2 ? Promise.reject(new Error('Database is down')) : Promise.resolve();
      },
    });
    await expect.poll(() => runs).toBeGreaterThanOrEqual(3);
    await scheduler?.beforeApplicationShutdown();
    scheduler = undefined;

    const { values } = await metrics.jobDuration.get();
    const count = (outcome: string) =>
      values.find(
        (value) =>
          value.metricName === 'stayflow_job_duration_seconds_count' &&
          value.labels.outcome === outcome,
      )?.value;
    expect(count('failed')).toBe(1);
    expect(count('succeeded')).toBe(runs - 1);
    const lastSuccess = (await metrics.jobLastSuccess.get()).values[0];
    expect(lastSuccess?.labels).toEqual({ name: 'flaky' });
    expect(Date.now() / 1000 - (lastSuccess?.value ?? 0)).toBeLessThan(5);
  });

  it('on shutdown, aborts the run in progress, waits for it, and starts no other', async () => {
    let runs = 0;
    let finished = false;
    const running = start({
      name: 'long',
      intervalMs: 1,
      run: async (signal) => {
        runs++;
        await new Promise((resolve) => {
          signal.addEventListener('abort', resolve);
        });
        // Wrapping up, such as handing back unsent events.
        await sleep(20);
        finished = true;
      },
    });
    await sleep(5);

    await running.beforeApplicationShutdown();
    scheduler = undefined;

    expect(finished).toBe(true);
    await sleep(20);
    expect(runs).toBe(1);
  });
});
