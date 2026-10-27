import pg from 'pg';

/** Parses int8 (money in minor units, counts) as a number, refusing values that would lose precision. */
export function parseInt8(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`int8 value ${value} is outside the safe integer range`);
  }
  return parsed;
}

export const pgTypes = new pg.TypeOverrides();
pgTypes.setTypeParser(pg.types.builtins.INT8, parseInt8);
// Calendar dates stay strings ('2026-12-01'); a JS Date would shift them by the time zone.
pgTypes.setTypeParser(pg.types.builtins.DATE, (value) => value);
