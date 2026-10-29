import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { hostProperty } from '@/test/fixtures';
import { NewPropertyForm } from './new-property-form';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function renderForm() {
  return render(
    <Providers>
      <NewPropertyForm />
    </Providers>,
  );
}

async function pick(
  user: ReturnType<typeof userEvent.setup>,
  field: string,
  search: string,
  option: RegExp,
) {
  const input = screen.getByRole('combobox', { name: field });
  await user.clear(input);
  await user.type(input, search);
  await user.click(await screen.findByRole('option', { name: option }));
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: 'Property name' }), 'Nile Loft Aswan');
  await pick(user, 'Time zone', 'Cairo', /Africa\/Cairo/);
  await pick(user, 'Currency', 'Egyptian', /Egyptian Pound/);
}

beforeEach(() => {
  api.mockReset();
  vi.clearAllMocks();
});

describe('NewPropertyForm', () => {
  it('builds the booking page address from the name, and previews the page', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Property name' }), 'Nile Loft Aswan');

    expect(screen.getByRole('textbox', { name: 'Booking page address' })).toHaveValue(
      'nile-loft-aswan',
    );
    expect(
      screen.getByText('Guests book at /stay/nile-loft-aswan. It cannot change later.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Aswan', { selector: 'em' })).toBeInTheDocument();
  });

  it('creates the property and opens its dashboard', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue({ ...hostProperty, slug: 'nile-loft-aswan', name: 'Nile Loft Aswan' });
    renderForm();

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create property' }));

    expect(api).toHaveBeenCalledWith('createProperty', {
      body: {
        name: 'Nile Loft Aswan',
        slug: 'nile-loft-aswan',
        timeZone: 'Africa/Cairo',
        currency: 'EGP',
      },
    });
    expect(router.push).toHaveBeenCalledWith('/host/nile-loft-aswan/today');
  });

  it('says what is missing, and sends nothing', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Create property' }));

    expect(screen.getByText('Name the property')).toBeInTheDocument();
    expect(screen.getByText('Pick the currency guests pay in')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Property name' })).toHaveFocus();
    expect(api).not.toHaveBeenCalled();
  });

  it('refuses an address kept for Stay Flow, and one another property uses', async () => {
    const user = userEvent.setup();
    api.mockRejectedValue(new ApiError(409, 'SLUG_TAKEN', 'Another property uses this slug.'));
    renderForm();

    await fill(user);
    const address = screen.getByRole('textbox', { name: 'Booking page address' });
    await user.clear(address);
    await user.type(address, 'new');
    await user.click(screen.getByRole('button', { name: 'Create property' }));
    expect(
      screen.getByText('/stay/new is kept for Stay Flow. Try another address.'),
    ).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();

    await user.clear(address);
    await user.type(address, 'dar-nubia');
    await user.click(screen.getByRole('button', { name: 'Create property' }));
    expect(
      await screen.findByText('Another property already uses /stay/dar-nubia. Try another.'),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderForm();

    expect(await axeViolations(container)).toEqual([]);
  });
});
