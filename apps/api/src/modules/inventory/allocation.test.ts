import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateSpan } from '../../platform/time/date-span.js';
import { bestFitOrder } from './allocation.js';

const date = (value: string) => Temporal.PlainDate.from(value);

// The stay is the nights of 10 to 12 December.
const stay = dateSpan(date('2026-12-10'), date('2026-12-13'));

const room = (name: string, freeFrom: string | null, freeUntil: string | null) => ({
  id: name,
  name,
  freeFrom: freeFrom === null ? null : date(freeFrom),
  freeUntil: freeUntil === null ? null : date(freeUntil),
});

const order = (...rooms: ReturnType<typeof room>[]) =>
  bestFitOrder(stay, rooms).map((unit) => unit.name);

describe('bestFitOrder', () => {
  it('prefers a room where the stay fills a gap exactly', () => {
    expect(
      order(
        room('101', null, null),
        room('102', '2026-12-10', null),
        room('103', '2026-12-10', '2026-12-13'),
      ),
    ).toEqual(['103', '102', '101']);
  });

  it('prefers a room where the stay meets a neighbour over a tighter floating gap', () => {
    expect(order(room('101', '2026-12-09', '2026-12-14'), room('102', '2026-12-10', null))).toEqual(
      ['102', '101'],
    );
  });

  it('then prefers the room that leaves the fewest free nights', () => {
    expect(
      order(
        room('101', '2026-12-10', null),
        room('102', '2026-12-10', '2026-12-20'),
        room('103', '2026-12-10', '2026-12-15'),
      ),
    ).toEqual(['103', '102', '101']);
  });

  it('breaks ties by room name, in numeric order', () => {
    expect(order(room('10', null, null), room('9', null, null))).toEqual(['9', '10']);
  });
});
