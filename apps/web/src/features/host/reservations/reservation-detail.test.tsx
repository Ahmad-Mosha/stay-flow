import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { aReservationDetail, host, hostProperty } from '@/test/fixtures';
import { HostContext } from '../host-context';
import { ReservationDetail } from './reservation-detail';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const params = { propertyId: hostProperty.id, reservationId: aReservationDetail().id };

function renderDetail() {
  return render(
    <Providers>
      <HostContext value={{ user: host, property: hostProperty }}>
        <ReservationDetail reservationId={params.reservationId} />
      </HostContext>
    </Providers>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-29T09:03:30Z'));
  api.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReservationDetail', () => {
  it('shows an arrival with what the desk can do and what cancelling would cost', async () => {
    api.mockResolvedValue(aReservationDetail());
    renderDetail();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sara Lindqvist' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Arrives today from 14:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as no-show' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument();
    expect(
      screen.getByText(/keeps the first night: refund 4,800 EGP, fee 2,400 EGP/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Price of each night' })).getAllByRole('listitem'),
    ).toHaveLength(3);

    const history = within(screen.getByRole('region', { name: 'History' }));
    expect(history.getByText('Held').parentElement).toHaveTextContent('Held by the guest');
    expect(history.getByText('Check-in due')).toBeInTheDocument();
    expect(history.getByText('today from 14:00')).toBeInTheDocument();
  });

  it('checks the guest in and says so', async () => {
    const user = userEvent.setup();
    const checkedIn = aReservationDetail({
      status: 'checked_in',
      events: [
        ...aReservationDetail().events,
        {
          fromStatus: 'confirmed',
          toStatus: 'checked_in',
          actor: 'host',
          userId: host.id,
          note: null,
          occurredAt: '2026-10-29T09:03:00.000Z',
        },
      ],
    });
    let current = aReservationDetail();
    api.mockImplementation((name: string) => {
      if (name === 'checkIn') current = checkedIn;
      return Promise.resolve(current);
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Check in' }));

    expect(api).toHaveBeenCalledWith('checkIn', { params });
    expect(await screen.findByText('Checked in.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check out' })).toBeInTheDocument();
    expect(screen.getByText('Checked in').parentElement).toHaveTextContent('Checked in by you');
  });

  it('cancels with a reason, and can refund the first night too', async () => {
    const user = userEvent.setup();
    let current = aReservationDetail();
    api.mockImplementation((name: string) => {
      if (name === 'cancelReservation') current = aReservationDetail({ status: 'cancelled' });
      return Promise.resolve(current);
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Cancel this booking?' }));
    await user.click(dialog.getByRole('button', { name: 'Cancel booking' }));
    expect(dialog.getByText('Say why, for the history')).toBeInTheDocument();
    expect(api).not.toHaveBeenCalledWith('cancelReservation', expect.anything());

    await user.type(dialog.getByRole('textbox', { name: 'Reason' }), 'Hotel overbooked');
    await user.click(dialog.getByRole('checkbox', { name: 'Refund the first night too' }));
    expect(dialog.getByText('Refund to the guest').parentElement).toHaveTextContent('7,200');
    await user.click(dialog.getByRole('button', { name: 'Cancel booking' }));

    expect(api).toHaveBeenCalledWith('cancelReservation', {
      params,
      body: { reason: 'Hotel overbooked', waiveFee: true },
    });
    expect(await screen.findByText(/Cancelled\. Sara Lindqvist gets an email/)).toBeInTheDocument();
  });

  it('says so when the booking is not at this property', async () => {
    api.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'No such reservation.'));
    renderDetail();

    expect(
      await screen.findByRole('heading', { name: 'This booking is not at this property' }),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    api.mockResolvedValue(aReservationDetail());
    const { container } = renderDetail();
    await screen.findByRole('heading', { name: 'Sara Lindqvist' });

    expect(await axeViolations(container)).toEqual([]);
  });
});
