import type { HostUnitTypeListResponse, HostUnitTypeResponse } from '@stay-flow/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { host, hostProperty, unitTypeList } from '@/test/fixtures';
import { HostContext } from '../host-context';
import { RoomsView } from './rooms-view';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const [garden, suite] = unitTypeList.unitTypes as [HostUnitTypeResponse, HostUnitTypeResponse];

// What the API holds, so a refetch after a change returns the change.
let current: HostUnitTypeListResponse;

function renderView(initial = unitTypeList, role = hostProperty.role) {
  return render(
    <Providers>
      <HostContext value={{ user: host, property: { ...hostProperty, role } }}>
        <RoomsView initial={initial} />
      </HostContext>
    </Providers>,
  );
}

function respond(handlers: Record<string, () => unknown>) {
  api.mockImplementation((endpoint: string) => {
    if (endpoint === 'listUnitTypes') return Promise.resolve(current);
    const handler = handlers[endpoint];
    return handler ? Promise.resolve().then(handler) : Promise.reject(new Error(endpoint));
  });
}

beforeEach(() => {
  current = unitTypeList;
  api.mockReset();
  respond({});
});

describe('RoomsView', () => {
  it('shows each room type with its rate, size and rooms', async () => {
    const { container } = renderView();

    const card = within(screen.getByRole('region', { name: 'Garden Double' }));
    expect(card.getByText('2,400 EGP')).toBeInTheDocument();
    expect(card.getByText('2 guests')).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Rename room 102' })).toBeInTheDocument();
    const empty = within(screen.getByRole('region', { name: 'Family Suite' }));
    expect(empty.getByText(/No rooms yet, so guests cannot book this type/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('adds a room type, its web address following the name', async () => {
    const user = userEvent.setup();
    const courtyard: HostUnitTypeResponse = {
      id: '01a1825d-fde1-7d91-b222-b86baff7fa9d',
      slug: 'courtyard-twin',
      name: 'Courtyard Twin',
      description: '',
      maxGuests: 2,
      baseRateMinor: 220_000,
      units: [],
    };
    respond({
      createUnitType: () => {
        current = { unitTypes: [...unitTypeList.unitTypes, courtyard] };
        return courtyard;
      },
    });
    renderView();

    await user.click(screen.getByRole('button', { name: 'Add room type' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add a room type' }));
    await user.type(dialog.getByRole('textbox', { name: 'Name' }), 'Courtyard Twin');
    expect(dialog.getByRole('textbox', { name: 'Web address' })).toHaveValue('courtyard-twin');
    await user.type(dialog.getByLabelText('Base rate a night'), '2200');
    await user.click(dialog.getByRole('button', { name: 'Add room type' }));

    expect(api).toHaveBeenCalledWith('createUnitType', {
      params: { propertyId: hostProperty.id },
      body: {
        name: 'Courtyard Twin',
        slug: 'courtyard-twin',
        description: '',
        maxGuests: 2,
        baseRateMinor: 220_000,
      },
    });
    expect(
      await screen.findByText('Courtyard Twin is added. Add its rooms next.'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Courtyard Twin' })).toBeInTheDocument();
  });

  it('adds a room, and says when its name is taken', async () => {
    const user = userEvent.setup();
    api.mockImplementation((endpoint: string) =>
      endpoint === 'createUnit'
        ? Promise.reject(
            new ApiError(409, 'UNIT_NAME_TAKEN', 'Another room here is already called 102.'),
          )
        : Promise.resolve(current),
    );
    renderView();

    await user.click(screen.getByRole('button', { name: 'Add a Family Suite room' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add a room' }));
    await user.type(dialog.getByRole('textbox', { name: 'Room name' }), '102');
    await user.click(dialog.getByRole('button', { name: 'Add room' }));

    expect(api).toHaveBeenCalledWith('createUnit', {
      params: { propertyId: hostProperty.id },
      body: { unitTypeId: suite.id, name: '102' },
    });
    expect(await dialog.findByText('Another room here is already called 102.')).toBeInTheDocument();
  });

  it('renames a room', async () => {
    const user = userEvent.setup();
    respond({
      updateUnit: () => ({ id: garden.units[0]?.id, unitTypeId: garden.id, name: '102A' }),
    });
    renderView();

    await user.click(screen.getByRole('button', { name: 'Rename room 102' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Rename room 102' }));
    const field = dialog.getByRole('textbox', { name: 'Room name' });
    await user.clear(field);
    await user.type(field, '102A');
    await user.click(dialog.getByRole('button', { name: 'Rename' }));

    expect(api).toHaveBeenCalledWith('updateUnit', {
      params: { propertyId: hostProperty.id, unitId: garden.units[0]?.id },
      body: { name: '102A' },
    });
    expect(await screen.findByText('Room 102 is now room 102A.')).toBeInTheDocument();
  });

  it('invites the first room type when there is none', () => {
    renderView({ unitTypes: [] });

    expect(screen.getByText('Add your first room type')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a room type' })).toBeInTheDocument();
  });

  it('lets the front desk see the rooms but not change them', () => {
    renderView(unitTypeList, 'front_desk');

    expect(screen.getByText('Only owners and managers can change rooms.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add|Edit|Rename/ })).toBeNull();
    expect(screen.getByText('102')).toBeInTheDocument();
  });
});
