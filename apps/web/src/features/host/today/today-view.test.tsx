import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { formatTime } from '@/lib/format';
import { axeViolations } from '@/test/axe';
import { aToday, arriving, host, hostProperty, tonightCalendar } from '@/test/fixtures';
import { HostContext } from '../host-context';
import { TodayView } from './today-view';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

function renderToday(today = aToday()) {
  return render(
    <Providers>
      <HostContext value={{ user: host, property: hostProperty }}>
        <TodayView initial={{ today, calendar: tonightCalendar }} />
      </HostContext>
    </Providers>,
  );
}

beforeEach(() => {
  // Six and a half minutes before room 103's hold runs out.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-29T09:03:30Z'));
  api.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TodayView', () => {
  it('shows the day in the hotel’s time zone, with every room tonight', () => {
    renderToday();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Today, 29 October' }),
    ).toBeInTheDocument();
    const clock = formatTime(Date.now(), 'Africa/Cairo');
    expect(screen.getByText(clock).closest('p')).toHaveTextContent(`Thursday · Cairo ${clock}`);
    const rooms = within(screen.getByRole('list', { name: 'Rooms tonight' }));
    expect(
      rooms.getByRole('listitem', { name: 'Room 102, Sara Lindqvist arriving today' }),
    ).toHaveTextContent('Arriving');
    expect(
      rooms.getByRole('listitem', {
        name: 'Room 103, held on the booking page for 7 more minutes',
      }),
    ).toHaveTextContent('Held 7m');
    expect(rooms.getByRole('listitem', { name: 'Room 104, free tonight' })).toBeInTheDocument();
    expect(
      screen.getByText(/Room 103 is held on the booking page for 7 more minutes/),
    ).toBeInTheDocument();
  });

  it('judges the month by occupancy and average rate', () => {
    renderToday();

    const month = within(screen.getByRole('region', { name: 'October on the books' }));
    expect(month.getByText('78,000')).toBeInTheDocument();
    // 25 of 3 rooms × 31 nights, and 78,000 EGP over 25 nights.
    expect(month.getByText('Occupancy').nextElementSibling).toHaveTextContent('27%');
    expect(month.getByText('Average rate').nextElementSibling).toHaveTextContent('3,120 EGP');
  });

  it('warns that an arrival’s room is still taken until its guest checks out', () => {
    renderToday();

    const arrivals = within(screen.getByRole('region', { name: /Arrivals/ }));
    expect(arrivals.getByText('Turnover: Omar leaves the room by 12:00')).toBeInTheDocument();
  });

  it('checks a guest in, then shows the fresh day and says so', async () => {
    const user = userEvent.setup();
    const checkedIn = { ...arriving, status: 'checked_in' as const };
    api.mockImplementation((name: string) => {
      if (name === 'checkIn') return Promise.resolve({ ...checkedIn, events: [] });
      if (name === 'getToday') return Promise.resolve(aToday({ arrivals: [checkedIn] }));
      return Promise.resolve(tonightCalendar);
    });
    renderToday();

    await user.click(screen.getByRole('button', { name: 'Check in Sara Lindqvist' }));

    expect(api).toHaveBeenCalledWith('checkIn', {
      params: { propertyId: hostProperty.id, reservationId: arriving.id },
    });
    const arrivals = within(screen.getByRole('region', { name: /Arrivals/ }));
    expect(await arrivals.findByText('Checked in')).toBeInTheDocument();
    expect(screen.getByText('Sara Lindqvist is checked in to room 102.')).toBeInTheDocument();
  });

  it('shows what is true now when a colleague got there first', async () => {
    const user = userEvent.setup();
    api.mockImplementation((name: string) => {
      if (name === 'checkIn') {
        return Promise.reject(new ApiError(409, 'INVALID_TRANSITION', 'Cannot check in.'));
      }
      return Promise.resolve(name === 'getToday' ? aToday() : tonightCalendar);
    });
    renderToday();

    await user.click(screen.getByRole('button', { name: 'Check in Sara Lindqvist' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This booking changed meanwhile. The list is up to date now.',
    );
    expect(api).toHaveBeenCalledWith('getToday', expect.anything());
  });

  it('has no accessibility violations', async () => {
    const { container } = renderToday();

    expect(await axeViolations(container)).toEqual([]);
  });
});
