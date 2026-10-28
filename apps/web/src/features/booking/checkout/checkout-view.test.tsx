import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { aReservation, property } from '@/test/fixtures';
import { saveHold } from '../hold-store';
import { CheckoutView } from './checkout-view';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const held = aReservation({ holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });

function renderCheckout() {
  return render(
    <Providers>
      <CheckoutView property={property} holdId={held.id} />
    </Providers>,
  );
}

async function fillDetails(name = 'Nour El-Sayed', email = 'nour@example.com') {
  const nameField = screen.getByRole('textbox', { name: 'Full name' });
  const emailField = screen.getByRole('textbox', { name: 'Email' });
  await userEvent.clear(nameField);
  await userEvent.type(nameField, name);
  await userEvent.clear(emailField);
  await userEvent.type(emailField, email);
}

const confirmButton = () => screen.getByRole('button', { name: /Confirm booking/ });

beforeEach(() => {
  sessionStorage.clear();
  api.mockReset();
  push.mockReset();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

describe('CheckoutView', () => {
  it('says so when this tab holds nothing, instead of an empty form', () => {
    renderCheckout();

    expect(
      screen.getByRole('heading', { name: 'This checkout is not open in this tab' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find a room' })).toHaveAttribute(
      'href',
      '/stay/dar-nubia',
    );
  });

  describe('with a room held', () => {
    beforeEach(() => {
      saveHold({ propertySlug: property.slug, reservation: held, heldAt: Date.now() });
    });

    it('confirms with the guest details and shows the booking reference', async () => {
      api.mockResolvedValue(
        aReservation({
          status: 'confirmed',
          holdExpiresAt: null,
          guest: { name: 'Nour El-Sayed', email: 'nour@example.com' },
        }),
      );
      renderCheckout();

      await fillDetails('  Nour El-Sayed ');
      await userEvent.click(confirmButton());

      expect(api).toHaveBeenCalledWith('confirmReservation', {
        params: { id: held.id },
        body: { guestName: 'Nour El-Sayed', guestEmail: 'nour@example.com' },
        idempotencyKey: expect.any(String) as string,
      });
      expect(
        await screen.findByRole('heading', { name: 'You are booked, Nour.' }),
      ).toBeInTheDocument();
      expect(screen.getByText('G1MMV3G4')).toBeInTheDocument();
    });

    it('reuses the idempotency key when Confirm is pressed again with the same details', async () => {
      api.mockRejectedValue(new TypeError('Failed to fetch'));
      renderCheckout();

      await fillDetails();
      await userEvent.click(confirmButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(/Your room is still held/);
      await userEvent.click(confirmButton());
      await fillDetails('Nour El-Sayed', 'nour@example.org');
      await userEvent.click(confirmButton());

      const keys = api.mock.calls.map(
        ([, input]) => (input as { idempotencyKey: string }).idempotencyKey,
      );
      expect(keys).toHaveLength(3);
      expect(keys[1]).toBe(keys[0]);
      expect(keys[2]).not.toBe(keys[0]);
    });

    it('offers the same search again when the server says the hold ended', async () => {
      api.mockRejectedValue(new ApiError(409, 'HOLD_EXPIRED', 'This hold has expired.'));
      renderCheckout();

      await fillDetails();
      await userEvent.click(confirmButton());

      expect(
        await screen.findByRole('heading', { name: 'Your 10 minutes are up' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Check these dates again' })).toHaveAttribute(
        'href',
        '/stay/dar-nubia?checkIn=2026-12-16&checkOut=2026-12-19&guests=2',
      );
    });

    it('shows field errors after the first press and clears each one while it is fixed', async () => {
      renderCheckout();

      await userEvent.click(confirmButton());
      const nameField = screen.getByRole('textbox', { name: 'Full name' });

      expect(nameField).toBeInvalid();
      expect(nameField).toHaveFocus();
      expect(screen.getByRole('textbox', { name: 'Email' })).toBeInvalid();
      await userEvent.type(nameField, 'Nour');
      expect(nameField).toBeValid();
      expect(api).not.toHaveBeenCalled();
    });

    it('gives the room back and returns to the search on "Change room or dates"', async () => {
      api.mockResolvedValue(undefined);
      renderCheckout();

      await userEvent.click(screen.getByRole('button', { name: 'Change room or dates' }));

      expect(api).toHaveBeenCalledWith('releaseReservation', {
        params: { id: held.id },
        keepalive: true,
      });
      expect(push).toHaveBeenCalledWith(
        '/stay/dar-nubia?checkIn=2026-12-16&checkOut=2026-12-19&guests=2',
      );
    });

    it('has no accessibility violations', async () => {
      const { container } = renderCheckout();

      expect(await axeViolations(container)).toEqual([]);
    });
  });
});
