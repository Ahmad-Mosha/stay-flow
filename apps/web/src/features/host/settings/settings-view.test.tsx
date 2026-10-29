import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { host, hostProperty } from '@/test/fixtures';
import { HostContext } from '../host-context';
import { SettingsView } from './settings-view';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function renderView(role = hostProperty.role) {
  return render(
    <Providers>
      <HostContext value={{ user: host, property: { ...hostProperty, role } }}>
        <SettingsView />
      </HostContext>
    </Providers>,
  );
}

/** Replaces a number and leaves the field, which is when a number field takes it. */
async function setNumber(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, value);
  await user.tab();
}

beforeEach(() => {
  vi.clearAllMocks();
  api.mockReset();
});

describe('SettingsView', () => {
  it('shows the saved settings, with nothing to save yet', async () => {
    const { container } = renderView();

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Dar Nubia Guesthouse');
    expect(screen.getByLabelText('Longest stay')).toHaveValue('21');
    expect(
      screen.getByText('Stays of 1 to 21 nights, booked up to 365 days ahead.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('saves only what changed, and refreshes the name everywhere', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue({
      ...hostProperty,
      name: 'Dar Nubia',
      stayRules: { ...hostProperty.stayRules, maxNights: 14 },
    });
    renderView();

    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Dar Nubia');
    await setNumber(user, 'Longest stay', '14');
    expect(
      screen.getByText('Stays of 1 to 14 nights, booked up to 365 days ahead.'),
    ).toBeInTheDocument();
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(api).toHaveBeenCalledWith('updateProperty', {
      params: { propertyId: hostProperty.id },
      body: { name: 'Dar Nubia', stayRules: { maxNights: 14 } },
    });
    expect(
      await screen.findByText('Settings saved. New bookings follow them from now on.'),
    ).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('marks a longest stay shorter than the shortest, and sends nothing', async () => {
    const user = userEvent.setup();
    renderView();

    await setNumber(user, 'Shortest stay', '5');
    await setNumber(user, 'Longest stay', '3');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText('At least as long as the shortest stay')).toBeInTheDocument();
    expect(screen.getByText('Fix the marked fields to save.')).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('puts the saved settings back on discard', async () => {
    const user = userEvent.setup();
    renderView();

    await setNumber(user, 'Free cancellation until', '72');
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByLabelText('Free cancellation until')).toHaveValue('48');
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('lets the front desk read the settings but not change them', () => {
    renderView('front_desk');

    expect(screen.getByText('Only owners and managers can change settings.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Longest stay')).toHaveAttribute('readonly');
  });
});
