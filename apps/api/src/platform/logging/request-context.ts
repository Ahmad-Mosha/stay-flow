import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` for the request with this id. Everything it calls, now or after an await, sees it. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** The id of the request the calling code works for, if it works for one. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
