import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { aGuestReservation, property } from '@/test/fixtures';
import { ManageView } from './manage-view';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

type Answers = Record<string, (input: unknown) => unknown>;

function answer(answers: Answers) {
  api.mockImplementation((name: string, input: unknown) => {
    const handler = answers[name] ?? (name === 'getProperty' ? () => property : undefined);
    if (!handler) throw new Error(`Unexpected call to ${name}`);
    return Promise.resolve().then(() => handler(input));
  });
}

function openLink(token = 'secret-token') {
  window.history.replaceState(null, '', `/manage#${token}`);
  return render(
    <Providers>
      <ManageView />
    </Providers>,
  );
}

const cancelled = aGuestReservation({
  status: 'cancelled',
  refund: { freeUntil: '2026-12-14T12:00:00.000Z', refundMinor: 790_000, feeMinor: 0 },
});

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/manage');
  api.mockReset();
});

describe('ManageView', () => {
  it('asks for the email link when the page is opened without one', () => {
    render(
      <Providers>
        <ManageView />
      </Providers>,
    );

    expect(
      screen.getByRole('heading', { name: 'Open the link from your confirmation email' }),
    ).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('opens the booking with the token and takes the token off the address', async () => {
    answer({ getGuestReservation: () => aGuestReservation() });
    openLink();

    expect(
      await screen.findByRole('heading', { name: 'See you on 16 December, Nour.' }),
    ).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('getGuestReservation', {
      bearer: 'secret-token',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    expect(window.location.hash).toBe('');
    expect(screen.getByText(/Cancelling now is free/)).toHaveTextContent('7,900 EGP');
  });

  it('cancels with the refund the guest was shown, and says so', async () => {
    const cancel = vi.fn(() => cancelled);
    answer({ getGuestReservation: () => aGuestReservation(), cancelGuestReservation: cancel });
    openLink();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    const dialog = within(screen.getByRole('alertdialog', { name: 'Cancel your stay?' }));
    await userEvent.type(
      dialog.getByRole('textbox', { name: 'Reason (optional)' }),
      'Flight moved',
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel booking' }));

    expect(cancel).toHaveBeenCalledWith({
      bearer: 'secret-token',
      body: { expectedRefundMinor: 790_000, reason: 'Flight moved' },
    });
    expect(
      await screen.findByRole('heading', { name: 'This booking is cancelled' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Cancelled. We emailed a note to nour@example.com.',
    );
  });

  it('cancels nothing and shows the new amounts when the refund changed meanwhile', async () => {
    const reads = vi
      .fn()
      .mockReturnValueOnce(aGuestReservation())
      .mockReturnValue(
        aGuestReservation({
          refund: {
            freeUntil: '2026-12-14T12:00:00.000Z',
            refundMinor: 550_000,
            feeMinor: 240_000,
          },
        }),
      );
    answer({
      getGuestReservation: reads,
      cancelGuestReservation: () => {
        throw new ApiError(409, 'REFUND_CHANGED', 'The refund has changed.');
      },
    });
    openLink();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    const dialog = within(screen.getByRole('alertdialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel booking' }));

    expect(await dialog.findByRole('alert')).toHaveTextContent('Nothing was cancelled.');
    expect(await dialog.findByText('Kept by the hotel, first night')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'This booking is cancelled' })).toBeNull();
  });

  it('explains a link that no longer works', async () => {
    answer({
      getGuestReservation: () => {
        throw new ApiError(401, 'INVALID_GUEST_LINK', 'Invalid or expired booking link.');
      },
    });
    openLink('old-token');

    expect(
      await screen.findByRole('heading', { name: 'This booking link no longer works' }),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    answer({ getGuestReservation: () => aGuestReservation() });
    const { container } = openLink();
    await screen.findByRole('heading', { level: 1 });

    expect(await axeViolations(container)).toEqual([]);
  });
});
