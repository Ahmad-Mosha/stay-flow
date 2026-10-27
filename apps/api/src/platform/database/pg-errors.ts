import pg from 'pg';

/** SQLSTATE codes for the integrity rules the schema enforces. */
export const PgErrorCode = {
  RestrictViolation: '23001',
  ForeignKeyViolation: '23503',
  UniqueViolation: '23505',
  CheckViolation: '23514',
  ExclusionViolation: '23P01',
} as const;

type PgErrorCode = (typeof PgErrorCode)[keyof typeof PgErrorCode];

/** Whether PostgreSQL rejected a statement with `code`, optionally for one named constraint. */
export function isPgError(
  error: unknown,
  code: PgErrorCode,
  constraint?: string,
): error is pg.DatabaseError {
  return (
    error instanceof pg.DatabaseError &&
    error.code === code &&
    (constraint === undefined || error.constraint === constraint)
  );
}
