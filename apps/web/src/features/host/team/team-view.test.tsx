import type { MemberResponse, TeamResponse } from '@stay-flow/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { host, hostProperty, teamList } from '@/test/fixtures';
import { HostContext } from '../host-context';
import { TeamView } from './team-view';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const [owner, manager, frontDesk] = teamList.members as [
  MemberResponse,
  MemberResponse,
  MemberResponse,
];
const karim: MemberResponse = {
  userId: '01a1825d-ff36-7836-92e7-3ed28f880c76',
  name: 'Karim Hassan',
  email: 'karim@example.com',
  role: 'manager',
  since: '2026-10-29T09:00:00.000Z',
};

// What the API holds, so a refetch after a change returns the change.
let current: TeamResponse;

function renderView(role = hostProperty.role) {
  return render(
    <Providers>
      <HostContext value={{ user: host, property: { ...hostProperty, role } }}>
        <TeamView initial={teamList} />
      </HostContext>
    </Providers>,
  );
}

function respond(handlers: Record<string, (options: { body?: unknown }) => unknown>) {
  api.mockImplementation((endpoint: string, options: { body?: unknown }) => {
    if (endpoint === 'listTeam') return Promise.resolve(current);
    const handler = handlers[endpoint];
    return handler
      ? Promise.resolve().then(() => handler(options))
      : Promise.reject(new Error(endpoint));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  current = teamList;
  api.mockReset();
  respond({});
});

describe('TeamView', () => {
  it('lists everyone on the team with their role', async () => {
    const { container } = renderView();

    const people = within(screen.getByRole('list', { name: 'People on the team' }));
    expect(people.getAllByRole('listitem')).toHaveLength(3);
    expect(people.getByText('You')).toBeInTheDocument();
    expect(
      people.getByRole('button', { name: 'Role of Youssef Adel: Manager. Change role' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Dar Nubia Guesthouse · 3 people')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('adds someone by their email, and says when no account uses it', async () => {
    const user = userEvent.setup();
    respond({
      addMember: ({ body }) => {
        if ((body as { email: string }).email !== karim.email) {
          throw new ApiError(422, 'NO_ACCOUNT', 'No account uses this email.');
        }
        current = { members: [...teamList.members, karim] };
        return karim;
      },
    });
    renderView();

    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add a person' }));
    const email = dialog.getByRole('textbox', { name: 'Email' });
    await user.type(email, 'karim@exmple.com');
    await user.click(dialog.getByRole('button', { name: /Role/ }));
    await user.click(screen.getByRole('option', { name: /Manager/ }));
    await user.click(dialog.getByRole('button', { name: 'Add to team' }));
    expect(
      await dialog.findByText(
        'No Stay Flow account uses karim@exmple.com. Ask them to sign up, then add them here.',
      ),
    ).toBeInTheDocument();

    await user.clear(email);
    expect(dialog.queryByText(/No Stay Flow account/)).toBeNull();
    await user.type(email, 'karim@example.com');
    await user.click(dialog.getByRole('button', { name: 'Add to team' }));

    expect(api).toHaveBeenCalledWith('addMember', {
      params: { propertyId: hostProperty.id },
      body: { email: 'karim@example.com', role: 'manager' },
    });
    expect(
      await screen.findByText('Karim Hassan is now a manager at Dar Nubia Guesthouse.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Dar Nubia Guesthouse · 4 people')).toBeInTheDocument();
  });

  it('changes a role from the menu', async () => {
    const user = userEvent.setup();
    respond({
      changeMemberRole: () => {
        const promoted = { ...frontDesk, role: 'manager' as const };
        current = { members: [owner, manager, promoted] };
        return promoted;
      },
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /Role of Nadia Farouk/ }));
    await user.click(screen.getByRole('menuitemradio', { name: /Manager/ }));

    expect(api).toHaveBeenCalledWith('changeMemberRole', {
      params: { propertyId: hostProperty.id, userId: frontDesk.userId },
      body: { role: 'manager' },
    });
    expect(await screen.findByText('Nadia Farouk is now a manager.')).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('keeps the only owner an owner, and says why', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: /Role of Amira Salem/ }));
    const step = screen.getByRole('menuitemradio', { name: /Manager/ });
    expect(step).toHaveAttribute('aria-disabled', 'true');
    expect(within(step).getByText('Make someone else an owner first.')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Remove Amira Salem' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Make someone else an owner first' }));
    expect(dialog.getByText(/You are the only owner of Dar Nubia Guesthouse/)).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Leave property' })).toBeNull();
  });

  it('removes someone once the owner confirms', async () => {
    const user = userEvent.setup();
    respond({
      removeMember: () => {
        current = { members: teamList.members.filter((member) => member !== manager) };
      },
    });
    renderView();

    await user.click(screen.getByRole('button', { name: 'Remove Youssef Adel' }));
    const dialog = within(screen.getByRole('alertdialog', { name: 'Remove Youssef Adel?' }));
    await user.click(dialog.getByRole('button', { name: 'Remove' }));

    expect(api).toHaveBeenCalledWith('removeMember', {
      params: { propertyId: hostProperty.id, userId: manager.userId },
    });
    expect(await screen.findByText('Youssef Adel is off the team.')).toBeInTheDocument();
    expect(await screen.findByText('Dar Nubia Guesthouse · 2 people')).toBeInTheDocument();
  });

  it('lets the rest of the team see it but not change it', () => {
    renderView('manager');

    expect(screen.getByText('Only owners can change the team.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a person|Remove|Role of/ })).toBeNull();
    expect(screen.getByText('Front desk', { selector: 'li span' })).toBeInTheDocument();
  });
});
