/** SQLSTATE codes for the integrity rules the schema enforces. */
export const PgErrorCode = {
  RestrictViolation: '23001',
  ForeignKeyViolation: '23503',
  UniqueViolation: '23505',
  CheckViolation: '23514',
  ExclusionViolation: '23P01',
} as const;
