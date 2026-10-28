import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axeViolations } from '@/test/axe';
import { cellsFor, NightStrip } from './night-strip';

const nights = (rates: number[]) =>
  rates.map((rateMinor, index) => ({
    date: `2026-12-${String(14 + index).padStart(2, '0')}`,
    rateMinor,
  }));

describe('cellsFor', () => {
  it('gives each night its own cell on a short stay', () => {
    expect(cellsFor(nights([240_000, 310_000])).map((cell) => cell.kind)).toEqual([
      'night',
      'night',
    ]);
  });

  it('groups nights in a row that share a price on a longer stay', () => {
    expect(cellsFor(nights([2, 2, 2, 3, 3, 3, 2]))).toEqual([
      { kind: 'run', first: '2026-12-14', last: '2026-12-16', nights: 3, rateMinor: 2 },
      { kind: 'run', first: '2026-12-17', last: '2026-12-19', nights: 3, rateMinor: 3 },
      { kind: 'run', first: '2026-12-20', last: '2026-12-20', nights: 1, rateMinor: 2 },
    ]);
  });

  it('counts nights per price when prices change too often to show in order', () => {
    expect(cellsFor(nights([2, 3, 2, 3, 2, 3]))).toEqual([
      { kind: 'rate', nights: 3, rateMinor: 2 },
      { kind: 'rate', nights: 3, rateMinor: 3 },
    ]);
  });
});

describe('NightStrip', () => {
  const strip = (rates: number[]) => (
    <NightStrip
      nightlyRates={nights(rates)}
      currency="EGP"
      checkInTime="14:00"
      checkOutTime="12:00"
    />
  );

  it('reads each night and its price out in order, between check-in and check-out', () => {
    render(strip([240_000, 310_000]));
    const items = within(screen.getByRole('list', { name: 'Price of each night' })).getAllByRole(
      'listitem',
    );

    expect(items.map((item) => item.textContent)).toEqual([
      'INCheck in from14:00',
      'Mon14Monday, 14 December 20262,400 EGP',
      'Tue15Tuesday, 15 December 20263,100 EGP',
      'OUTCheck out by12:00',
    ]);
  });

  it('brackets the nights above the lowest price as a seasonal rate', () => {
    const { container } = render(strip([240_000, 310_000, 310_000]));

    expect(container).toHaveTextContent('SEASONAL RATE');
  });

  it('shows no seasonal bracket when every night costs the same', () => {
    const { container } = render(strip([240_000, 240_000]));

    expect(container).not.toHaveTextContent('SEASONAL');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(strip([240_000, 310_000, 310_000, 240_000, 240_000]));

    expect(await axeViolations(container)).toEqual([]);
  });
});
