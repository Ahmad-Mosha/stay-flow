import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { aReservation, anAvailability, property } from '@/test/fixtures';
import { RoomResults } from './room-results';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const availability = anAvailability([
  { slug: 'garden-double', name: 'Garden Double', freeUnits: 0 },
  { slug: 'nile-view-double', name: 'Nile View Double', freeUnits: 1 },
  { slug: 'family-suite', name: 'Family Suite', freeUnits: 3 },
]);

function answer(placeHold: () => Promise<unknown>) {
  api.mockImplementation((name: string) =>
    name === 'searchAvailability' ? Promise.resolve(availability) : placeHold(),
  );
}

function renderResults(onHeld = vi.fn()) {
  render(
    <Providers>
      <RoomResults
        property={property}
        checkIn="2026-12-16"
        checkOut="2026-12-18"
        guests={2}
        onHeld={onHeld}
      />
    </Providers>,
  );
  return onHeld;
}

const room = async (name: string) =>
  screen.findByRole('article', { name }).then((card) => within(card));

beforeEach(() => {
  api.mockReset();
});

describe('RoomResults', () => {
  it('asks for dates before searching', () => {
    render(
      <Providers>
        <RoomResults
          property={property}
          checkIn={null}
          checkOut={null}
          guests={2}
          onHeld={vi.fn()}
        />
      </Providers>,
    );

    expect(
      screen.getByRole('heading', { name: 'Pick your nights on the calendar' }),
    ).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('lists rooms cheapest first with sold-out rooms last', async () => {
    answer(() => Promise.reject(new Error('not called')));
    renderResults();

    await screen.findByRole('heading', { name: '2 nights, 16 to 18 December' });
    const names = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);

    expect(names).toEqual(['Nile View Double', 'Family Suite', 'Garden Double']);
    expect((await room('Garden Double')).getByText('Sold out')).toBeInTheDocument();
    expect(
      (await room('Nile View Double')).getByText('Last room for these dates'),
    ).toBeInTheDocument();
  });

  it('holds the room with an idempotency key and hands the hold on', async () => {
    const hold = aReservation();
    answer(() => Promise.resolve(hold));
    const onHeld = renderResults();

    await userEvent.click((await room('Family Suite')).getByRole('button', { name: 'Reserve' }));

    expect(api).toHaveBeenCalledWith('placeHold', {
      params: { slug: 'dar-nubia' },
      body: { unitType: 'family-suite', checkIn: '2026-12-16', checkOut: '2026-12-18', guests: 2 },
      idempotencyKey: expect.any(String) as string,
    });
    expect(onHeld).toHaveBeenCalledWith(hold);
  });

  it('explains a room lost to another guest and searches again', async () => {
    answer(() => Promise.reject(new ApiError(409, 'SOLD_OUT', 'No room is free.')));
    renderResults();

    const card = await room('Nile View Double');
    await userEvent.click(card.getByRole('button', { name: 'Reserve' }));

    expect(await card.findByRole('alert')).toHaveTextContent(
      'Someone just booked the last Nile View Double.',
    );
    expect(api.mock.calls.filter(([name]) => name === 'searchAvailability')).toHaveLength(2);
  });

  it('has no accessibility violations', async () => {
    answer(() => Promise.reject(new Error('not called')));
    renderResults();
    await screen.findByRole('heading', { name: '2 nights, 16 to 18 December' });

    expect(await axeViolations(document.body)).toEqual([]);
  });
});
