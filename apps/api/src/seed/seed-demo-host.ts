import { sql } from 'kysely';
import { hashPassword } from '../modules/identity/password.js';
import type { Database } from '../platform/database/database.js';
import { demoHost, demoProperty } from './demo-property.js';
import type { SeedResult } from './seed-demo-property.js';

/** Makes the demo host the owner of the demo property. Does nothing if they already are. */
export async function seedDemoHost(db: Database): Promise<SeedResult> {
  const passwordHash = await hashPassword(demoHost.password);

  return db.transaction().execute(async (trx) => {
    const property = await trx
      .selectFrom('properties')
      .select('id')
      .where('slug', '=', demoProperty.slug)
      .executeTakeFirstOrThrow();

    await trx
      .insertInto('users')
      .values({ name: demoHost.name, email: demoHost.email, passwordHash })
      .onConflict((oc) => oc.expression(sql`lower(email)`).doNothing())
      .execute();
    const user = await trx
      .selectFrom('users')
      .select('id')
      .where(sql`lower(email)`, '=', demoHost.email)
      .executeTakeFirstOrThrow();

    const member = await trx
      .insertInto('propertyMembers')
      .values({ propertyId: property.id, userId: user.id, role: 'owner' })
      .onConflict((oc) => oc.columns(['propertyId', 'userId']).doNothing())
      .returning('userId')
      .executeTakeFirst();
    return member === undefined ? 'already-seeded' : 'seeded';
  });
}
