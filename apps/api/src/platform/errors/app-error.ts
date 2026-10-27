import { type ErrorCode, errorCatalog } from './error-catalog.js';

/** One invalid field, shaped like the `errors` member in RFC 9457's example. */
export interface FieldError {
  readonly detail: string;
  /** A JSON Pointer to the field, such as `#/checkOut`. */
  readonly pointer: string;
}

interface AppErrorOptions extends ErrorOptions {
  readonly errors?: readonly FieldError[];
}

/** An expected failure with a stable code. `detail` is shown to clients, so keep it safe. */
export class AppError extends Error {
  override readonly name = 'AppError';
  readonly errors: readonly FieldError[] | undefined;

  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    { errors, ...options }: AppErrorOptions = {},
  ) {
    super(detail ?? errorCatalog[code].title, options);
    this.errors = errors;
  }

  get status(): number {
    return errorCatalog[this.code].status;
  }
}
