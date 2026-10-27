import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError, type FieldError } from '../errors/app-error.js';

/** Validates a request part against a contract schema, e.g. `@Query(new ZodValidationPipe(schema))`. */
export class ZodValidationPipe<Schema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<Schema>
> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError('VALIDATION_FAILED', 'The request has invalid fields.', {
        errors: result.error.issues.map(toFieldError),
      });
    }
    return result.data;
  }
}

function toFieldError(issue: z.core.$ZodIssue): FieldError {
  return { detail: issue.message, pointer: toJsonPointer(issue.path) };
}

/** RFC 6901: `~` and `/` inside a key are escaped as `~0` and `~1`. */
function toJsonPointer(path: readonly PropertyKey[]): string {
  const segments = path.map((key) => String(key).replaceAll('~', '~0').replaceAll('/', '~1'));
  return ['#', ...segments].join('/');
}
