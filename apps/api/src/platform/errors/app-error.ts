import { type ErrorCode, errorCatalog } from './error-catalog.js';

/** One invalid field, shaped like the `errors` member in RFC 9457's example. */
export interface FieldError {
  readonly detail: string;
  /** A JSON Pointer to the field, such as `#/checkOut`. */
  readonly pointer: string;
}

interface AppErrorOptions extends ErrorOptions {
  readonly errors?: readonly FieldError[];
  /** Response headers that tell the client how to recover, such as `Retry-After`. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** An expected failure with a stable code. `detail` is shown to clients, so keep it safe. */
export class AppError extends Error {
  override readonly name = 'AppError';
  readonly errors: readonly FieldError[] | undefined;
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    { errors, headers = {}, ...options }: AppErrorOptions = {},
  ) {
    super(detail ?? errorCatalog[code].title, options);
    this.errors = errors;
    this.headers = headers;
  }

  get status(): number {
    return errorCatalog[this.code].status;
  }
}
