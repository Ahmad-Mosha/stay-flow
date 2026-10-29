import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { host, hostProperty, weeksCalendar } from '@/test/fixtures';
import { HostContext } from '../host-context';
import { BlockDialog, type BlockDraft } from './block-dialog';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const room103 = '01a1825d-fdef-7caf-9e8d-ded549254d8c';

function renderDialog(draft: BlockDraft | null = null) {
  const onBlocked = vi.fn();
  render(
    <Providers>
      <HostContext value={{ user: host, property: hostProperty }}>
        <BlockDialog
          isOpen
          onOpenChange={vi.fn()}
          rooms={weeksCalendar.unitTypes}
          today="2026-10-29"
          draft={draft}
          onBlocked={onBlocked}
        />
      </HostContext>
    </Providers>,
  );
  return { dialog: within(screen.getByRole('dialog', { name: 'Block dates' })), onBlocked };
}

beforeEach(() => {
  api.mockReset();
});

describe('BlockDialog', () => {
  it('asks for the room, the nights and a reason before it blocks anything', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog();

    await user.click(dialog.getByRole('button', { name: 'Block' }));

    expect(dialog.getByText('Choose the room to block')).toBeInTheDocument();
    expect(dialog.getByText('Pick the nights to block')).toBeInTheDocument();
    expect(dialog.getByText('Say why, for the team')).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('blocks the nights dragged across on the chart', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue({
      id: '01a1825d-fec9-7bec-80b4-a135d7ed5d9e',
      unitId: room103,
      nights: { from: '2026-11-02', to: '2026-11-05' },
      reason: 'Deep clean',
    });
    const { dialog, onBlocked } = renderDialog({
      unitId: room103,
      nights: { from: '2026-11-02', to: '2026-11-05' },
    });

    expect(
      dialog.getByText('3 nights: Mon 2 Nov to Wed 4 Nov. Back on sale Thu 5 Nov.'),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Deep clean' }));
    await user.click(dialog.getByRole('button', { name: 'Block 3 nights' }));

    expect(api).toHaveBeenCalledWith('createBlock', {
      params: { propertyId: hostProperty.id },
      body: {
        unitId: room103,
        nights: { from: '2026-11-02', to: '2026-11-05' },
        reason: 'Deep clean',
      },
    });
    await vi.waitFor(() => {
      expect(onBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ unitId: room103 }),
        'Room 103 is blocked for 3 nights from Mon 2 Nov.',
      );
    });
  });

  it('explains when the room is not free on those nights', async () => {
    const user = userEvent.setup();
    api.mockRejectedValue(new ApiError(409, 'UNIT_TAKEN', 'Room 103 is not free.'));
    const { dialog } = renderDialog({
      unitId: room103,
      nights: { from: '2026-11-02', to: '2026-11-05' },
    });

    await user.type(dialog.getByRole('textbox', { name: 'Reason' }), 'Repairs');
    await user.click(dialog.getByRole('button', { name: 'Block 3 nights' }));

    expect(
      await dialog.findByText(
        'Room 103 is not free on all of those nights. Pick other nights or another room.',
      ),
    ).toBeInTheDocument();
  });

  it('lists the rooms by type', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog();

    await user.click(dialog.getByRole('button', { name: /Room/ }));
    const list = within(screen.getByRole('listbox'));
    expect(list.getByRole('group', { name: 'Garden Double' })).toBeInTheDocument();
    await user.click(list.getByRole('option', { name: 'Room 104' }));
    expect(dialog.getByRole('button', { name: /Room/ })).toHaveTextContent('Room 104');
  });
});
