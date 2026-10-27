import { sql } from 'kysely';
import type { PropertyRole } from '../../src/modules/access/policy.js';
import type { Database } from '../../src/platform/database/database.js';
import { hashSecretToken, newSecretToken } from '../../src/platform/security/secret-token.js';
import { uniqueEmail } from './auth.js';
import { createInventory } from './fixtures.js';

// Never checked: these users sign in through sessions made below, not with a password.
const UNUSED_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g';

export interface TestUser {
  readonly id: string;
  readonly email: string;
  /** A `session=<token>` pair for the Cookie header. */
  readonly cookie: string;
}

/** A user with a live session, made directly in the database to skip password hashing. */
export async function createSignedInUser(db: Database, name = 'Test Host'): Promise<TestUser> {
  const email = uniqueEmail();
  const { id } = await db
    .insertInto('users')
    .values({ name, email, passwordHash: UNUSED_PASSWORD_HASH })
    .returning('id')
    .executeTakeFirstOrThrow();
  const token = newSecretToken();
  await db
    .insertInto('sessions')
    .values({
      userId: id,
      tokenHash: hashSecretToken(token),
      expiresAt: sql<Date>`now() + interval '1 day'`,
    })
    .execute();
  return { id, email, cookie: `session=${token}` };
}

export async function addMember(
  db: Database,
  propertyId: string,
  userId: string,
  role: PropertyRole,
): Promise<void> {
  await db.insertInto('propertyMembers').values({ propertyId, userId, role }).execute();
}

/** A property with one member in each role. */
export async function createTeam(db: Database) {
  const inventory = await createInventory(db);
  const [owner, manager, frontDesk] = await Promise.all([
    createSignedInUser(db, 'Owner'),
    createSignedInUser(db, 'Manager'),
    createSignedInUser(db, 'Front Desk'),
  ]);
  await addMember(db, inventory.propertyId, owner.id, 'owner');
  await addMember(db, inventory.propertyId, manager.id, 'manager');
  await addMember(db, inventory.propertyId, frontDesk.id, 'front_desk');
  return { ...inventory, owner, manager, frontDesk };
}

export async function setRole(
  db: Database,
  propertyId: string,
  userId: string,
  role: PropertyRole,
): Promise<void> {
  await db
    .updateTable('propertyMembers')
    .set({ role })
    .where('propertyId', '=', propertyId)
    .where('userId', '=', userId)
    .execute();
}

export async function roleOf(
  db: Database,
  propertyId: string,
  userId: string,
): Promise<PropertyRole | undefined> {
  const row = await db
    .selectFrom('propertyMembers')
    .select('role')
    .where('propertyId', '=', propertyId)
    .where('userId', '=', userId)
    .executeTakeFirst();
  return row?.role;
}
