import type { ReservationListResponse } from '@stay-flow/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { aHostReservation, arriving, host, hostProperty, leaving } from '@/test/fixtures';
import { HostContext } from '../host-context';
import { ReservationsView } from './reservations-view';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));

// The address as the view reads it, kept in step with history.replaceState as in Next.js.
const listeners = new Set<() => void>();
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          (onChange) => {
            listeners.add(onChange);
            return () => listeners.delete(onChange);
          },
          () => window.location.search,
        ),
      ),
  };
});

const firstPage: ReservationListResponse = {
  reservations: [arriving, leaving],
  nextCursor: 'page-2',
};

function renderView(page = firstPage) {
  return render(
    <Providers>
      <HostContext value={{ user: host, property: hostProperty }}>
        <ReservationsView initial={{ page, filters: { q: null, status: null } }} />
      </HostContext>
    </Providers>,
  );
}

const table = () => within(screen.getByRole('table', { name: 'Bookings, newest first' }));

beforeEach(() => {
  api.mockReset();
  window.history.replaceState(null, '', '/host/dar-nubia/reservations');
  const replace = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, 'replaceState').mockImplementation((...args) => {
    replace(...args);
    for (const listener of listeners) listener();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReservationsView', () => {
  it('lists bookings newest first, each opening its own page', () => {
    renderView();

    expect(table().getByRole('link', { name: 'Sara Lindqvist' })).toHaveAttribute(
      'href',
      `/host/dar-nubia/reservations/${arriving.id}`,
    );
    expect(table().getByText('D6J3V8KM')).toBeInTheDocument();
    expect(table().getAllByRole('row')).toHaveLength(3);
  });

  it('searches as the host types, and keeps the search in the address', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue({ reservations: [leaving], nextCursor: null });
    renderView();

    await user.type(screen.getByRole('searchbox', { name: 'Find a booking' }), 'omar');

    await waitFor(() => {
      expect(table().queryByRole('link', { name: 'Sara Lindqvist' })).not.toBeInTheDocument();
    });
    expect(table().getByRole('link', { name: 'Omar Farouk' })).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(
      'listReservations',
      expect.objectContaining({ params: { propertyId: hostProperty.id }, query: { q: 'omar' } }),
    );
    expect(window.location.search).toBe('?q=omar');
    expect(screen.getByText('That is every match.')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue({ reservations: [leaving], nextCursor: null });
    renderView();

    await user.click(screen.getByRole('radio', { name: 'In house' }));

    await waitFor(() => {
      expect(table().queryByRole('link', { name: 'Sara Lindqvist' })).not.toBeInTheDocument();
    });
    expect(api).toHaveBeenCalledWith(
      'listReservations',
      expect.objectContaining({
        query: { status: 'checked_in' },
      }),
    );
    expect(window.location.search).toBe('?status=checked_in');
  });

  it('says when nothing matches, with the way back to every booking', async () => {
    const user = userEvent.setup();
    api.mockImplementation((_name: string, { query }: { query: { q?: string } }) =>
      Promise.resolve(query.q ? { reservations: [], nextCursor: null } : firstPage),
    );
    renderView();

    await user.type(screen.getByRole('searchbox', { name: 'Find a booking' }), 'zzz');
    expect(
      await screen.findByRole('heading', { name: 'No booking matches “zzz”' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show every booking' }));
    expect(await table().findByRole('link', { name: 'Sara Lindqvist' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Find a booking' })).toHaveValue('');
  });

  it('loads the next page on request', async () => {
    const user = userEvent.setup();
    const older = aHostReservation({
      id: '01a1825d-fe5a-73bc-9a85-2a5bc65dff71',
      reference: 'K2P8W4QX',
      guest: { name: 'Lukas Becker', email: 'lukas@example.com' },
    });
    api.mockResolvedValue({ reservations: [older], nextCursor: null });
    renderView();

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    expect(await table().findByRole('link', { name: 'Lukas Becker' })).toBeInTheDocument();
    expect(table().getAllByRole('row')).toHaveLength(4);
    expect(api).toHaveBeenCalledWith(
      'listReservations',
      expect.objectContaining({
        query: { cursor: 'page-2' },
      }),
    );
    expect(screen.getByText('That is every booking.')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderView();
    expect(await axeViolations(container)).toEqual([]);
  });
});
