interface ErrorDefinition {
  readonly status: number;
  readonly title: string;
}

/**
 * Every error code the API can return, with its HTTP status and a stable title.
 * Codes are part of the public contract: clients switch on them, so never rename one.
 * Feature modules add their own codes here (for example UNIT_UNAVAILABLE) as they land.
 */
export const errorCatalog = {
  BAD_REQUEST: { status: 400, title: 'Bad request' },
  UNAUTHENTICATED: { status: 401, title: 'Authentication required' },
  FORBIDDEN: { status: 403, title: 'Forbidden' },
  NOT_FOUND: { status: 404, title: 'Not found' },
  METHOD_NOT_ALLOWED: { status: 405, title: 'Method not allowed' },
  CONFLICT: { status: 409, title: 'Conflict' },
  PAYLOAD_TOO_LARGE: { status: 413, title: 'Payload too large' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, title: 'Unsupported media type' },
  RATE_LIMITED: { status: 429, title: 'Too many requests' },
  INTERNAL_ERROR: { status: 500, title: 'Internal server error' },
  SERVICE_UNAVAILABLE: { status: 503, title: 'Service unavailable' },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof errorCatalog;

const codesByStatus = new Map<number, ErrorCode>(
  Object.entries(errorCatalog).map(([code, { status }]) => [status, code as ErrorCode]),
);

/** The generic code for a status raised outside our own code (framework, body parser). */
export function codeForStatus(status: number): ErrorCode {
  return codesByStatus.get(status) ?? (status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR');
}
