interface ErrorDefinition {
  readonly status: number;
  readonly title: string;
}

/** One generic code per HTTP status, for errors raised outside our code (framework, body parser). */
const httpErrors = {
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

/** Specific failures a client can act on. */
const domainErrors = {
  VALIDATION_FAILED: { status: 400, title: 'Request validation failed' },
  CHECK_IN_PASSED: { status: 422, title: 'Check-in date has passed' },
  CHECK_IN_TOO_FAR: { status: 422, title: 'Check-in date is too far ahead' },
  STAY_TOO_SHORT: { status: 422, title: 'Stay is too short' },
  STAY_TOO_LONG: { status: 422, title: 'Stay is too long' },
  TOO_MANY_GUESTS: { status: 422, title: 'Too many guests for this room type' },
  SOLD_OUT: { status: 409, title: 'Sold out' },
  HOLD_EXPIRED: { status: 409, title: 'Hold expired' },
  RESERVATION_NOT_HELD: { status: 409, title: 'Reservation is not on hold' },
  IDEMPOTENCY_KEY_INVALID: { status: 400, title: 'Missing or invalid Idempotency-Key' },
  IDEMPOTENCY_KEY_IN_USE: { status: 409, title: 'Request already in progress' },
  IDEMPOTENCY_KEY_REUSED: { status: 422, title: 'Idempotency key reused' },
  EMAIL_TAKEN: { status: 409, title: 'Email already registered' },
  INVALID_CREDENTIALS: { status: 401, title: 'Invalid email or password' },
  CROSS_ORIGIN_REQUEST: { status: 403, title: 'Cross-origin request blocked' },
  INSUFFICIENT_ROLE: { status: 403, title: 'Role does not allow this' },
  SLUG_TAKEN: { status: 409, title: 'Slug already taken' },
  NO_ACCOUNT: { status: 422, title: 'No account with this email' },
  ALREADY_MEMBER: { status: 409, title: 'Already a member' },
  LAST_OWNER: { status: 409, title: 'Property needs an owner' },
} as const satisfies Record<string, ErrorDefinition>;

/** Every error code the API returns. Codes are a public contract: never rename one. */
export const errorCatalog = { ...httpErrors, ...domainErrors };

export type ErrorCode = keyof typeof errorCatalog;

const codesByStatus = new Map<number, ErrorCode>(
  Object.entries(httpErrors).map(([code, { status }]) => [status, code as ErrorCode]),
);

/** The generic code for a status raised outside our code. */
export function codeForStatus(status: number): ErrorCode {
  return codesByStatus.get(status) ?? (status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR');
}
