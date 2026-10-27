import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(
  z.object({ guests: z.coerce.number().int().min(1), 'a/b~c': z.string().optional() }),
);

function failureOf(value: unknown): AppError {
  try {
    pipe.transform(value);
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the pipe to reject the value');
}

describe('ZodValidationPipe', () => {
  it('returns the parsed value', () => {
    expect(pipe.transform({ guests: '2' })).toEqual({ guests: 2 });
  });

  it('rejects with VALIDATION_FAILED and one error per invalid field', () => {
    const error = failureOf({ guests: '0' });

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.errors).toEqual([{ pointer: '#/guests', detail: expect.any(String) as string }]);
  });

  it('escapes keys in the JSON Pointer', () => {
    const error = failureOf({ guests: '1', 'a/b~c': 5 });

    expect(error.errors?.map((field) => field.pointer)).toEqual(['#/a~1b~0c']);
  });
});
