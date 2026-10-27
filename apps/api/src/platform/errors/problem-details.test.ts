import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AppError } from './app-error.js';
import { toProblemDetails } from './problem-details.js';

const context = { instance: '/v1/reservations', requestId: 'req-12345678' };

describe('toProblemDetails', () => {
  it('maps an AppError to its catalogued status, title and code', () => {
    const problem = toProblemDetails(
      new AppError('CONFLICT', 'That room was just taken.'),
      context,
    );

    expect(problem).toEqual({
      type: 'urn:stay-flow:problem:conflict',
      title: 'Conflict',
      status: 409,
      detail: 'That room was just taken.',
      instance: '/v1/reservations',
      code: 'CONFLICT',
      requestId: 'req-12345678',
    });
  });

  it('omits detail when an AppError has none', () => {
    const problem = toProblemDetails(new AppError('NOT_FOUND'), context);

    expect(problem).not.toHaveProperty('detail');
  });

  it('keeps the message of a framework 4xx exception', () => {
    const problem = toProblemDetails(new NotFoundException('Cannot GET /v1/nope'), context);

    expect(problem).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Cannot GET /v1/nope',
    });
  });

  it('joins a list of framework validation messages', () => {
    const problem = toProblemDetails(
      new BadRequestException(['a is required', 'b is invalid']),
      context,
    );

    expect(problem).toMatchObject({ status: 400, detail: 'a is required; b is invalid' });
  });

  it('hides the message of a framework 5xx exception', () => {
    const problem = toProblemDetails(
      new ServiceUnavailableException('connection to 10.0.0.5 refused'),
      context,
    );

    expect(problem).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(problem).not.toHaveProperty('detail');
  });

  it('exposes client errors that Express middleware marks as safe to show', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
      status: 400,
      expose: true,
    });

    expect(toProblemDetails(parseError, context)).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      detail: 'Unexpected token } in JSON',
    });
  });

  it('turns any other error into a generic 500 that leaks nothing', () => {
    const problem = toProblemDetails(
      new Error('password authentication failed for user "app"'),
      context,
    );

    expect(problem).toEqual({
      type: 'urn:stay-flow:problem:internal-error',
      title: 'Internal server error',
      status: 500,
      instance: '/v1/reservations',
      code: 'INTERNAL_ERROR',
      requestId: 'req-12345678',
    });
  });

  it('does not trust an error that claims to be exposable with a 5xx status', () => {
    const sneaky = Object.assign(new Error('internal detail'), { status: 502, expose: true });

    expect(toProblemDetails(sneaky, context)).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});
