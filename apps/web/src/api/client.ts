import { endpoints, type Endpoint, type EndpointName } from '@stay-flow/contracts';
import type { z } from 'zod';
import { recordServerTime } from './server-clock';

type Endpoints = typeof endpoints;

type ParamsOf<E> = E extends { params: z.ZodType } ? { params: z.input<E['params']> } : unknown;
type QueryOf<E> = E extends { query: z.ZodType } ? { query: z.input<E['query']> } : unknown;
type BodyOf<E> = E extends { body: z.ZodType } ? { body: z.input<E['body']> } : unknown;

export interface RequestOptions {
  signal?: AbortSignal;
  /** Sent as `Idempotency-Key`; reuse it to retry the same request safely. */
  idempotencyKey?: string;
  /** A guest's manage-booking token, sent as `Authorization: Bearer`. */
  bearer?: string;
  /** Lets the request finish after the page unloads, as when releasing a hold on the way out. */
  keepalive?: boolean;
  /** The browser's cookies, forwarded when a server component calls the API on its behalf. */
  cookie?: string;
}

export type ApiInput<N extends EndpointName> = ParamsOf<Endpoints[N]> &
  QueryOf<Endpoints[N]> &
  BodyOf<Endpoints[N]> &
  RequestOptions;

/** The input is optional only for endpoints with no params, query or body. */
export type ApiArgs<N extends EndpointName> =
  Partial<ApiInput<N>> extends ApiInput<N> ? [input?: ApiInput<N>] : [input: ApiInput<N>];

export type ApiResponse<N extends EndpointName> = Endpoints[N] extends { response: z.ZodType }
  ? z.output<Endpoints[N]['response']>
  : undefined;

/** A field the API rejected, as `#/guestEmail`. */
export interface FieldProblem {
  detail: string;
  pointer: string;
}

/** A problem+json error from the API. `code` is stable; the copy shown to people is ours. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string | undefined,
    readonly errors: readonly FieldProblem[] = [],
  ) {
    super(detail ?? code);
  }

  static async from(response: Response): Promise<ApiError> {
    const problem = (await response.json().catch(() => ({}))) as {
      code?: string;
      detail?: string;
      errors?: FieldProblem[];
    };
    return new ApiError(
      response.status,
      problem.code ?? 'UNKNOWN',
      problem.detail,
      problem.errors ?? [],
    );
  }
}

export function isApiError(error: unknown, ...codes: string[]): error is ApiError {
  return error instanceof ApiError && (codes.length === 0 || codes.includes(error.code));
}

// The browser calls the API through the web app's own origin (see next.config.ts), so the
// session cookie stays first-party and fetch sends it by default. Server components call the
// API directly and pass the cookie in `cookie`.
function baseUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.API_URL ?? 'http://localhost:3000';
}

function pathFor(template: string, params: Record<string, string> | undefined): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`Missing path parameter "${name}" for ${template}`);
    return encodeURIComponent(value);
  });
}

type QueryValue = string | number | boolean | readonly (string | number)[] | null | undefined;

function searchFor(query: Record<string, QueryValue> | undefined): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * Calls an endpoint from the shared contract: the path, method and types come from
 * `@stay-flow/contracts`, and every response is checked against its schema.
 */
export async function api<N extends EndpointName>(
  name: N,
  ...[input]: ApiArgs<N>
): Promise<ApiResponse<N>> {
  const endpoint: Endpoint = endpoints[name];
  const { params, query, body, signal, idempotencyKey, bearer, keepalive, cookie } = (input ??
    {}) as {
    params?: Record<string, string>;
    query?: Record<string, QueryValue>;
    body?: unknown;
  } & RequestOptions;

  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  if (cookie) headers.set('Cookie', cookie);

  const response = await fetch(`${baseUrl()}${pathFor(endpoint.path, params)}${searchFor(query)}`, {
    method: endpoint.method.toUpperCase(),
    headers,
    body: body === undefined ? null : JSON.stringify(body),
    cache: 'no-store',
    ...(signal && { signal }),
    ...(keepalive && { keepalive }),
  });
  recordServerTime(response.headers.get('Date'));

  if (!response.ok) throw await ApiError.from(response);
  if (!endpoint.response) return undefined as ApiResponse<N>;
  return endpoint.response.parse(await response.json()) as ApiResponse<N>;
}
