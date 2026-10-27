import { z } from 'zod';
import { AppError } from '../../platform/errors/app-error.js';
import type { ListPosition } from './host-reservations.repository.js';

const positionSchema = z.object({
  createdAt: z.iso.datetime({ precision: 6 }),
  id: z.uuid(),
});

/**
 * Turns a page's end into an opaque cursor. Clients pass it back as it is, so its contents can
 * change without breaking them.
 */
export function encodeCursor(position: ListPosition): string {
  return Buffer.from(JSON.stringify(position)).toString('base64url');
}

/** Reads a cursor from `encodeCursor`. Throws INVALID_CURSOR for anything else. */
export function decodeCursor(cursor: string): ListPosition {
  try {
    return positionSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
  } catch {
    throw new AppError('INVALID_CURSOR', 'This cursor did not come from this list.');
  }
}
