import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { requestIdOf } from '../logging/request-id.js';
import { AppError } from './app-error.js';
import { PROBLEM_CONTENT_TYPE, toProblemDetails } from './problem-details.js';

/** Turns every error into a problem+json response. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(ProblemDetailsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const problem = toProblemDetails(exception, {
      // originalUrl keeps the /v1 prefix; the query string is dropped because it may hold tokens.
      instance: request.originalUrl.split('?', 1)[0] ?? '/',
      requestId: requestIdOf(request),
    });

    if (problem.status >= 500) {
      this.logger.error({ err: exception, requestId: problem.requestId }, 'Request failed');
    }

    if (exception instanceof AppError) {
      response.set(exception.headers);
    }
    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }
}
