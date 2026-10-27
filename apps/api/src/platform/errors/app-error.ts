import { type ErrorCode, errorCatalog } from './error-catalog.js';

/** An expected failure with a stable code. `detail` is shown to clients, so keep it safe. */
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
