import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept a caller's request id (from a proxy or another service) only if it looks like an id.
const REQUEST_ID_PATTERN = /^[\w-]{8,128}$/;

export function resolveRequestId(incoming: string | string[] | undefined): string {
  return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
    ? incoming
    : randomUUID();
}

/** The id assigned by requestIdMiddleware. Typed loosely by pino-http, but always a string here. */
export function requestIdOf(request: Request): string {
  return typeof request.id === 'string' ? request.id : 'unassigned';
}

/**
 * Registered before every other middleware, including the JSON body parser, so even a request
 * rejected for a malformed body gets an id in its response and its problem document.
 */
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
