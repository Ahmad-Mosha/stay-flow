import { setTimeout } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { currentRequestId, runWithRequestId } from './request-context.js';

describe('request context', () => {
  it('follows the code it runs across awaits', async () => {
    const seen = await runWithRequestId('request-1', async () => {
      await setTimeout(1);
      return currentRequestId();
    });

    expect(seen).toBe('request-1');
  });

  it('keeps requests that run at the same time apart', async () => {
    const handle = (id: string, delayMs: number) =>
      runWithRequestId(id, async () => {
        await setTimeout(delayMs);
        return currentRequestId();
      });

    expect(await Promise.all([handle('slow', 20), handle('fast', 1)])).toEqual(['slow', 'fast']);
  });

  it('has no request outside one', () => {
    expect(currentRequestId()).toBeUndefined();
  });
});
