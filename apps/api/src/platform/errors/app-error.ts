import { type ErrorCode, errorCatalog } from './error-catalog.js';

/**
 * An expected failure with a stable code, such as a sold-out room or an expired hold.
 * Throw it from any layer; the exception filter turns it into a problem+json response.
 * `detail` is shown to clients, so it must never contain internal information.
 */
export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    options?: ErrorOptions,
  ) {
    super(detail ?? errorCatalog[code].title, options);
  }

  get status(): number {
    return errorCatalog[this.code].status;
  }
}
