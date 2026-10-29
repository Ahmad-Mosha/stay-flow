import { sql } from 'kysely';
import { hashPassword } from '../modules/identity/password.js';
import type { Database } from '../platform/database/database.js';
import { demoHost, demoProperty, demoTeam } from './demo-property.js';
import type { SeedResult } from './seed-hotel.js';

/**
 * Makes the demo host the owner of a demo hotel, Dar Nubia unless `slug` names another, with a
 * manager and a front desk clerk beside them. Does nothing if the owner is already there.
 */
export async function seedDemoHost(
  db: Database,
  slug: string = demoProperty.slug,
): Promise<SeedResult> {
  const passwordHash = await hashPassword(demoHost.password);
  const people = [{ ...demoHost, role: 'owner' as const }, ...demoTeam];

  return db.transaction().execute(async (trx) => {
    const property = await trx
      .selectFrom('properties')
      .select('id')
      .where('slug', '=', slug)
      .executeTakeFirstOrThrow();

    await trx
      .insertInto('users')
      .values(people.map(({ name, email }) => ({ name, email, passwordHash })))
      .onConflict((oc) => oc.expression(sql`lower(email)`).doNothing())
      .execute();
    const users = await trx
      .selectFrom('users')
      .select(['id', 'email'])
      .where(
        sql`lower(email)`,
        'in',
        people.map(({ email }) => email),
      )
      .execute();
    const idOf = new Map(users.map((user) => [user.email.toLowerCase(), user.id]));
    const userId = (email: string) => {
      const id = idOf.get(email);
      if (id === undefined) throw new Error(`The demo user ${email} was not saved`);
      return id;
    };

    const members = await trx
      .insertInto('propertyMembers')
      .values(
        people.map(({ email, role }) => ({
          propertyId: property.id,
          userId: userId(email),
          role,
        })),
      )
      .onConflict((oc) => oc.columns(['propertyId', 'userId']).doNothing())
      .returning('role')
      .execute();
    return members.some((member) => member.role === 'owner') ? 'seeded' : 'already-seeded';
  });
}
