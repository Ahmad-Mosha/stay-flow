import { HttpException } from '@nestjs/common';
import { AppError } from './app-error.js';
import { codeForStatus, type ErrorCode, errorCatalog } from './error-catalog.js';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** An RFC 9457 problem document, plus our stable `code` and the request id. */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance: string;
  readonly code: ErrorCode;
  readonly requestId: string;
}

export interface ProblemContext {
  readonly instance: string;
  readonly requestId: string;
}

export function toProblemDetails(exception: unknown, context: ProblemContext): ProblemDetails {
  if (exception instanceof AppError) {
    return problem(exception.code, exception.status, exception.detail, context);
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const detail = status < 500 ? httpExceptionMessage(exception) : undefined;
    return problem(codeForStatus(status), status, detail, context);
  }

  if (isExposedClientError(exception)) {
    return problem(codeForStatus(exception.status), exception.status, exception.message, context);
  }

  // An unexpected error: the client gets a generic 500, the logs get the details.
  return problem('INTERNAL_ERROR', 500, undefined, context);
}

function problem(
  code: ErrorCode,
  status: number,
  detail: string | undefined,
  context: ProblemContext,
): ProblemDetails {
  return {
    type: `urn:stay-flow:problem:${code.toLowerCase().replaceAll('_', '-')}`,
    title: errorCatalog[code].title,
    status,
    ...(detail === undefined ? {} : { detail }),
    instance: context.instance,
    code,
    requestId: context.requestId,
  };
}

function httpExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  const message = (response as { message?: unknown }).message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    return message.join('; ');
  }
  return exception.message;
}

/** The http-errors convention used by Express middleware such as the JSON body parser. */
interface ExposedClientError {
  readonly status: number;
  readonly message: string;
  readonly expose: true;
}

function isExposedClientError(error: unknown): error is ExposedClientError {
  if (!(error instanceof Error)) {
    return false;
  }
  const { status, expose } = error as Partial<ExposedClientError>;
  return expose === true && typeof status === 'number' && status >= 400 && status < 500;
}
