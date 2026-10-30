/**
 * Books rooms like a crowd of guests, so the Grafana dashboards have something to show. It runs
 * against the stack on this machine only, never the live site:
 *
 *   pnpm demo:traffic                               5 minutes at http://localhost:8080
 *   pnpm demo:traffic --minutes 2 --guests 8
 *
 * Each guest searches, holds a room, then confirms, gives up, or walks away and lets the hold
 * expire. Every few seconds a group races for the last rooms of a type on the same nights: the
 * database lets one booking per room through and refuses the overlaps, which the Bookings
 * dashboard counts as blocked double bookings. Stays land 7 to 11 months ahead, after the demo
 * hotels' own bookings.
 *
 * The demo host works the front desk too. Guests walk in and book a room for tonight; the host
 * checks them in or marks them a no-show, checks them out again, which frees the room, and
 * cancels some of the bookings made far ahead, as when a guest calls. It touches only the
 * bookings this script made.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8080' },
    minutes: { type: 'string', default: '5' },
    guests: { type: 'string', default: '4' },
  },
});

const baseUrl = new URL(options.url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)) {
  throw new Error(`Refusing to book fake stays at ${baseUrl.origin}: only this machine's stack.`);
}
const deadline = Date.now() + Number(options.minutes) * 60_000;

/** The demo host's sign-in, shown to visitors on the demo's sign-in page. */
const demoHost = { email: 'host@example.com', password: 'nubia-demo-password' };

const properties = [
  'dar-nubia',
  'corniche-house-cairo',
  'blue-hole-dive-lodge',
  'theban-hills-inn',
  'alfama-courtyard-lisbon',
  'riad-zitoun-marrakech',
];

interface UnitType {
  readonly slug: string;
  readonly maxGuests: number;
  readonly freeUnits: number;
}

interface Stay {
  readonly property: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly guests: number;
}

interface Booking {
  readonly id: string;
  readonly property: string;
}

interface DeskReservation {
  readonly id: string;
  readonly status: string;
}

interface Today {
  readonly date: string;
  readonly arrivals: DeskReservation[];
  readonly inHouse: DeskReservation[];
}

interface Call {
  readonly body?: object | undefined;
  readonly idempotencyKey?: string;
  /** The host's session cookie. */
  readonly session?: string;
}

const tally = {
  searches: 0,
  holds: 0,
  retries: 0,
  confirmed: 0,
  released: 0,
  abandoned: 0,
  soldOut: 0,
  refused: 0,
  checkedIn: 0,
  noShows: 0,
  checkedOut: 0,
  cancelled: 0,
};

/** Confirmed bookings months ahead, for the host to cancel. */
const bookedAhead: Booking[] = [];

async function call(method: string, path: string, { body, idempotencyKey, session }: Call = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  // A browser sends its origin with every write, and the API takes a host's write only from the
  // site's own.
  if (method !== 'GET') {
    headers.origin = baseUrl.origin;
  }
  if (idempotencyKey !== undefined) {
    headers['idempotency-key'] = idempotencyKey;
  }
  if (session !== undefined) {
    headers.cookie = session;
  }
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text === '' ? undefined : (JSON.parse(text) as unknown),
  };
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)] as T;
}

/** The date `days` after a `YYYY-MM-DD` date. */
function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

function randomStay(): Stay {
  const checkIn = addDays(new Date().toISOString().slice(0, 10), randomInt(210, 330));
  return {
    property: pick(properties),
    checkIn,
    checkOut: addDays(checkIn, randomInt(2, 5)),
    guests: randomInt(1, 3),
  };
}

/** The room types with a free room for the whole stay. */
async function search(stay: Stay): Promise<UnitType[]> {
  tally.searches++;
  const query = new URLSearchParams({
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    guests: String(stay.guests),
  });
  const { status, body } = await call(
    'GET',
    `/v1/properties/${stay.property}/availability?${query.toString()}`,
  );
  if (status !== 200) {
    return [];
  }
  return (body as { unitTypes: UnitType[] }).unitTypes.filter((type) => type.freeUnits > 0);
}

/** Holds a room of the type, and returns the reservation id, or undefined if none was free. */
async function hold(stay: Stay, unitType: string, key = randomUUID()): Promise<string | undefined> {
  const request = {
    unitType,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    guests: stay.guests,
  };
  const { status, body } = await call('POST', `/v1/properties/${stay.property}/holds`, {
    body: request,
    idempotencyKey: key,
  });
  if (status === 201) {
    tally.holds++;
    return (body as { id: string }).id;
  }
  if (status === 409) {
    tally.soldOut++;
  } else {
    tally.refused++;
  }
  return undefined;
}

async function confirm(id: string): Promise<boolean> {
  const name = pick(['Nour Hassan', 'Omar Farouk', 'Laila Mansour', 'Youssef Adel', 'Mona Saleh']);
  const guest = { guestName: name, guestEmail: `${name.split(' ')[0]?.toLowerCase()}@example.com` };
  const { status } = await call('POST', `/v1/reservations/${id}/confirm`, {
    body: guest,
    idempotencyKey: randomUUID(),
  });
  if (status === 200) {
    tally.confirmed++;
  }
  return status === 200;
}

async function release(id: string): Promise<void> {
  const { status } = await call('POST', `/v1/reservations/${id}/release`);
  if (status === 204) {
    tally.released++;
  }
}

/** One guest, over and over: search, hold, think, then book, give up or walk away. */
async function guest(): Promise<void> {
  while (Date.now() < deadline) {
    const stay = randomStay();
    const types = await search(stay);
    if (types.length > 0) {
      const unitType = pick(types).slug;
      const key = randomUUID();
      const id = await hold(stay, unitType, key);
      if (id !== undefined) {
        // A client that timed out sends the same request again; the key makes it a replay.
        if (randomInt(10) === 0) {
          await hold(stay, unitType, key);
          tally.retries++;
        }
        await sleep(randomInt(500, 3_000));
        const choice = randomInt(100);
        if (choice < 65) {
          if (await confirm(id)) {
            bookedAhead.push({ id, property: stay.property });
          }
        } else if (choice < 85) {
          await release(id);
        } else {
          // The hold runs out after 10 minutes, and the worker's sweeper expires it.
          tally.abandoned++;
        }
      }
    }
    await sleep(randomInt(300, 1_500));
  }
}

/** Guests who all want the last rooms of a type on the same nights, at the same moment. */
async function race(): Promise<void> {
  while (Date.now() < deadline) {
    const stay = randomStay();
    const types = await search(stay);
    const scarcest = types.toSorted((a, b) => a.freeUnits - b.freeUnits)[0];
    if (scarcest !== undefined) {
      const crowd = scarcest.freeUnits + randomInt(2, 5);
      const ids = await Promise.all(Array.from({ length: crowd }, () => hold(stay, scarcest.slug)));
      // Free the rooms again, so the next race has something to fight over.
      await Promise.all(
        ids.filter((id): id is string => id !== undefined).map((id) => release(id)),
      );
    }
    await sleep(randomInt(3_000, 8_000));
  }
}

async function signIn(): Promise<string> {
  const { status, headers } = await call('POST', '/v1/auth/sign-in', { body: demoHost });
  const session = headers.getSetCookie()[0]?.split(';')[0];
  if (status !== 200 || session === undefined) {
    throw new Error(`Could not sign in as ${demoHost.email}: HTTP ${status}.`);
  }
  return session;
}

/** The demo host at the front desk of each hotel in turn, on the hotel's own today. */
async function frontDesk(): Promise<void> {
  const session = await signIn();
  const { body } = await call('GET', '/v1/host/properties', { session });
  const propertyIds = new Map(
    (body as { properties: { id: string; slug: string }[] }).properties.map((p) => [p.slug, p.id]),
  );
  const desk = (slug: string) => {
    const id = propertyIds.get(slug);
    if (id === undefined) {
      throw new Error(`${demoHost.email} is not on the team of ${slug}.`);
    }
    return `/v1/host/properties/${id}`;
  };
  const step = async (booking: Booking, action: string, request?: object) => {
    const path = `${desk(booking.property)}/reservations/${booking.id}/${action}`;
    return (await call('POST', path, { body: request, session })).status === 200;
  };
  const walkIns = new Set<string>();

  while (Date.now() < deadline) {
    const property = pick(properties);
    const today = (await call('GET', `${desk(property)}/today`, { session })).body as Today;
    for (const arrival of today.arrivals) {
      if (walkIns.has(arrival.id) && arrival.status === 'confirmed') {
        const booking = { id: arrival.id, property };
        if (randomInt(5) === 0) {
          tally.noShows += Number(await step(booking, 'no-show'));
        } else {
          tally.checkedIn += Number(await step(booking, 'check-in'));
        }
      }
    }
    // Guests leave early, the same day: that frees the room for tonight's next walk-in.
    for (const guest of today.inHouse) {
      if (walkIns.has(guest.id) && randomInt(2) === 0) {
        tally.checkedOut += Number(await step({ id: guest.id, property }, 'check-out'));
      }
    }

    const stay = {
      property,
      checkIn: today.date,
      checkOut: addDays(today.date, randomInt(2, 4)),
      guests: randomInt(1, 3),
    };
    const types = await search(stay);
    if (types.length > 0) {
      const id = await hold(stay, pick(types).slug);
      if (id !== undefined && (await confirm(id))) {
        walkIns.add(id);
      }
    }

    // Now and then a guest calls to cancel a booking made months ahead.
    if (bookedAhead.length > 0 && randomInt(3) === 0) {
      const booking = pick(bookedAhead);
      bookedAhead.splice(bookedAhead.indexOf(booking), 1);
      const reason = pick(['Guest called: flight cancelled', 'Guest called: plans changed']);
      tally.cancelled += Number(await step(booking, 'cancel', { reason }));
    }
    await sleep(randomInt(2_000, 6_000));
  }
}

async function report(): Promise<void> {
  while (Date.now() < deadline) {
    await sleep(10_000);
    console.log(
      `${tally.holds} holds (${tally.retries} replayed), ${tally.confirmed} booked, ` +
        `${tally.released} given up, ${tally.abandoned} left to expire, ${tally.soldOut} sold out, ` +
        `${tally.refused} refused. Front desk: ${tally.checkedIn} checked in, ` +
        `${tally.noShows} no-shows, ${tally.checkedOut} checked out, ${tally.cancelled} cancelled`,
    );
  }
}

console.log(
  `Booking at ${baseUrl.origin} with ${options.guests} guests for ${options.minutes} min.`,
);
await Promise.all([
  ...Array.from({ length: Number(options.guests) }, () => guest()),
  race(),
  frontDesk(),
  report(),
]);
console.log('Done. Open the Bookings dashboard at http://localhost:3002.');
