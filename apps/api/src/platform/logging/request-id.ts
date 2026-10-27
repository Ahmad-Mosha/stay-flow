import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

// A caller's id is reused only if it looks like an id, so it cannot inject into logs.
const REQUEST_ID_PATTERN = /^[\w-]{8,128}$/;

export function resolveRequestId(incoming: string | string[] | undefined): string {
  return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
    ? incoming
    : randomUUID();
}

export function requestIdOf(request: Request): string {
  return typeof request.id === 'string' ? request.id : 'unassigned';
}

/** Runs before the body parser, so even a malformed body gets an id. */
export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const id = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
  request.id = id;
  response.setHeader(REQUEST_ID_HEADER, id);
  next();
}
