import { describe, expect, it } from 'vitest';
import { historyMarkers, planHistory } from './demo-history.js';
import { demoHotels } from './demo-hotels.js';
import { darNubia } from './demo-property.js';

const [lodge] = demoHotels.filter((hotel) => hotel.property.slug === 'blue-hole-dive-lodge');
if (lodge === undefined) throw new Error('The dive lodge is missing from the demo hotels');

describe('planHistory', () => {
  it('plans the same stays every time', () => {
    expect(planHistory(lodge, new Map(), new Set())).toEqual(
      planHistory(lodge, new Map(), new Set()),
    );
  });

  it('keeps every stay in the window, within the hotel’s stay lengths', () => {
    const { stays } = planHistory(lodge, new Map(), new Set());
    const { fromDay, toDay } = lodge.history;

    expect(stays.length).toBeGreaterThan(200);
    for (const stay of stays) {
      expect(stay.from).toBeGreaterThanOrEqual(fromDay);
      expect(stay.from + stay.nights).toBeLessThanOrEqual(toDay);
      expect(stay.nights).toBeGreaterThanOrEqual(lodge.property.minNights);
      expect(stay.nights).toBeLessThanOrEqual(lodge.property.maxNights);
    }
  });

  it('never puts two stays or blocks in one room on the same night', () => {
    const { stays, blocks } = planHistory(lodge, new Map(), new Set());
    const entries = [...stays, ...blocks].sort((a, b) => a.from - b.from);

    for (const unit of new Set(entries.map((entry) => entry.unit))) {
      const inRoom = entries.filter((entry) => entry.unit === unit);
      for (const [index, entry] of inRoom.entries()) {
        const next = inRoom[index + 1];
        if (next !== undefined) expect(entry.from + entry.nights).toBeLessThanOrEqual(next.from);
      }
    }
  });

  it('leaves the nights already taken alone', () => {
    const taken = new Map([['C1', [[-30, 30] as const]]]);
    const { stays, blocks } = planHistory(lodge, taken, new Set());

    for (const entry of [...stays, ...blocks].filter(({ unit }) => unit === 'C1')) {
      expect(entry.from + entry.nights <= -30 || entry.from >= 30).toBe(true);
    }
  });

  it('only checks in guests who have arrived, and confirms only stays still to come', () => {
    const { stays } = planHistory(lodge, new Map(), new Set());

    for (const stay of stays) {
      if (stay.status === 'confirmed') expect(stay.from).toBeGreaterThanOrEqual(0);
      if (stay.status === 'checked_in') expect(stay.from).toBeLessThan(0);
      if (stay.status === 'checked_out') expect(stay.from + stay.nights).toBeLessThan(0);
    }
    expect(new Set(stays.map((stay) => stay.status))).toEqual(
      new Set([
        'checked_out',
        'checked_in',
        'confirmed',
        'cancelled',
        'no_show',
        'expired',
        'released',
      ]),
    );
  });

  it('skips references already in use', () => {
    const first = planHistory(darNubia, new Map(), new Set()).stays.map((stay) => stay.reference);
    const again = planHistory(darNubia, new Map(), new Set(first)).stays.map(
      (stay) => stay.reference,
    );

    expect(new Set([...first, ...again]).size).toBe(first.length + again.length);
  });

  it('marks a planned history by the references of its first stays', () => {
    const { stays } = planHistory(lodge, new Map(), new Set());
    const planned = new Set(stays.map((stay) => stay.reference));

    expect(historyMarkers(lodge).some((reference) => planned.has(reference))).toBe(true);
  });
});
