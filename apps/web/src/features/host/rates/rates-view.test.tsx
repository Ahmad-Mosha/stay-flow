import type { RateOverrideListResponse, RateOverrideResponse } from '@stay-flow/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { host, hostProperty, seasonList, unitTypeList } from '@/test/fixtures';
import { HostContext } from '../host-context';
import { RatesView } from './rates-view';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const [garden] = unitTypeList.unitTypes;
const lowSeason: RateOverrideResponse = {
  id: '01a1825d-fee1-7bec-80b4-a135d7ed5da1',
  unitTypeId: garden?.id ?? '',
  nights: { from: '2027-02-01', to: '2027-02-15' },
  rateMinor: 200_000,
  label: 'Low season',
};

// What the API holds, so a refetch after a change returns the change.
let seasons: RateOverrideListResponse;

function renderView(role = hostProperty.role) {
  return render(
    <Providers>
      <HostContext value={{ user: host, property: { ...hostProperty, role } }}>
        <RatesView initial={{ unitTypes: unitTypeList, rateOverrides: seasonList }} />
      </HostContext>
    </Providers>,
  );
}

/** Types both dates into a range field, segment by segment, as a host would. */
async function typeNights(
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  digits: string,
) {
  const [day] = within(field).getAllByRole('spinbutton');
  if (!day) throw new Error('The nights field has no date segments');
  await user.click(day);
  await user.keyboard(digits);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-29T09:03:30Z'));
  seasons = seasonList;
  api.mockReset();
  api.mockImplementation((endpoint: string) => {
    if (endpoint === 'listRateOverrides') return Promise.resolve(seasons);
    if (endpoint === 'listUnitTypes') return Promise.resolve(unitTypeList);
    return Promise.reject(new Error(`unexpected ${endpoint}`));
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RatesView', () => {
  it('shows each base rate and the seasons that override it', async () => {
    const { container } = renderView();

    expect(screen.getByText('2,400')).toBeInTheDocument();
    expect(screen.getByText('Sleeps 2 · 2 rooms · 1 seasonal rate')).toBeInTheDocument();
    expect(screen.getByText('Sleeps 4 · 0 rooms · No seasonal rates')).toBeInTheDocument();
    const list = within(screen.getByRole('list', { name: 'Seasonal rates, soonest first' }));
    expect(list.getByText('Winter holidays')).toBeInTheDocument();
    expect(list.getByText('18 Dec 2026 – 4 Jan 2027')).toBeInTheDocument();
    expect(list.getByText('18 nights')).toBeInTheDocument();
    expect(list.getByText('3,100 EGP')).toBeInTheDocument();
    expect(list.getByText('+29% on base')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('adds a seasonal rate from typed dates', async () => {
    const user = userEvent.setup();
    api.mockImplementation((endpoint: string) => {
      if (endpoint === 'createRateOverride') {
        seasons = { rateOverrides: [...seasonList.rateOverrides, lowSeason] };
        return Promise.resolve(lowSeason);
      }
      if (endpoint === 'listRateOverrides') return Promise.resolve(seasons);
      return Promise.resolve(unitTypeList);
    });
    renderView();

    await user.click(screen.getByRole('button', { name: 'Add seasonal rate' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add a seasonal rate' }));
    await user.click(dialog.getByRole('button', { name: /Room type/ }));
    await user.click(screen.getByRole('option', { name: /Garden Double/ }));
    // The end's year passes through 2, before the start: the field keeps it until it is 2027.
    await typeNights(user, dialog.getByRole('group', { name: 'Nights' }), '01022027' + '15022027');
    expect(
      dialog.getByText('14 nights, last one Sun 14 Feb. The base rate is back Mon 15 Feb.'),
    ).toBeInTheDocument();
    await user.type(dialog.getByLabelText('Rate a night'), '2000');
    await user.click(dialog.getByRole('button', { name: 'Low season' }));
    await user.click(dialog.getByRole('button', { name: 'Add rate' }));

    expect(api).toHaveBeenCalledWith('createRateOverride', {
      params: { propertyId: hostProperty.id },
      body: {
        unitTypeId: garden?.id,
        nights: { from: '2027-02-01', to: '2027-02-15' },
        rateMinor: 200_000,
        label: 'Low season',
      },
    });
    expect(
      await screen.findByText('Low season: Garden Double sells at 2,000 EGP from Mon 1 Feb.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('−17% on base')).toBeInTheDocument();
  });

  it('explains when another seasonal rate already covers the nights', async () => {
    const user = userEvent.setup();
    api.mockImplementation((endpoint: string) =>
      endpoint === 'createRateOverride'
        ? Promise.reject(
            new ApiError(
              409,
              'RATES_OVERLAP',
              'Another rate for this room type already covers some of these nights.',
            ),
          )
        : Promise.resolve(endpoint === 'listRateOverrides' ? seasons : unitTypeList),
    );
    renderView();

    await user.click(screen.getByRole('button', { name: 'Add seasonal rate' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add a seasonal rate' }));
    await user.click(dialog.getByRole('button', { name: /Room type/ }));
    await user.click(screen.getByRole('option', { name: /Garden Double/ }));
    await typeNights(user, dialog.getByRole('group', { name: 'Nights' }), '20122026' + '27122026');
    await user.type(dialog.getByLabelText('Rate a night'), '3500');
    await user.type(dialog.getByRole('textbox', { name: 'Name' }), 'Christmas');
    await user.click(dialog.getByRole('button', { name: 'Add rate' }));

    expect(
      await dialog.findByText(
        'Another seasonal rate for Garden Double already covers some of these nights. Pick other nights, or remove that rate first.',
      ),
    ).toBeInTheDocument();
  });

  it('changes a base rate', async () => {
    const user = userEvent.setup();
    api.mockImplementation((endpoint: string) =>
      endpoint === 'updateUnitType'
        ? Promise.resolve({ ...garden, baseRateMinor: 260_000 })
        : Promise.resolve(endpoint === 'listRateOverrides' ? seasons : unitTypeList),
    );
    renderView();

    await user.click(screen.getByRole('button', { name: 'Change the base rate of Garden Double' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Base rate for Garden Double' }));
    const field = dialog.getByLabelText('Rate a night');
    await user.clear(field);
    await user.type(field, '2600');
    await user.click(dialog.getByRole('button', { name: 'Save rate' }));

    expect(api).toHaveBeenCalledWith('updateUnitType', {
      params: { propertyId: hostProperty.id, unitTypeId: garden?.id },
      body: { baseRateMinor: 260_000 },
    });
    expect(
      await screen.findByText('Garden Double now sells at 2,600 EGP a night.'),
    ).toBeInTheDocument();
  });

  it('removes a seasonal rate once the host confirms', async () => {
    const user = userEvent.setup();
    api.mockImplementation((endpoint: string) => {
      if (endpoint === 'deleteRateOverride') {
        seasons = { rateOverrides: [] };
        return Promise.resolve(undefined);
      }
      return Promise.resolve(endpoint === 'listRateOverrides' ? seasons : unitTypeList);
    });
    renderView();

    await user.click(
      screen.getByRole('button', { name: 'Remove Winter holidays for Garden Double' }),
    );
    const dialog = within(screen.getByRole('alertdialog', { name: 'Remove Winter holidays?' }));
    expect(
      dialog.getByText(/Garden Double goes back to its base rate of 2,400 EGP/),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Remove rate' }));

    expect(api).toHaveBeenCalledWith('deleteRateOverride', {
      params: { propertyId: hostProperty.id, rateOverrideId: seasonList.rateOverrides[0]?.id },
    });
    expect(await screen.findByText('Winter holidays is removed.')).toBeInTheDocument();
    expect(await screen.findByText(/No seasonal rates ahead/)).toBeInTheDocument();
  });

  it('lets the front desk read the rates but not change them', () => {
    renderView('front_desk');

    expect(screen.getByText('Only owners and managers can change rates.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add seasonal rate|Change|Remove/ })).toBeNull();
  });
});
