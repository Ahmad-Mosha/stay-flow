'use client';

import type { MemberResponse, PropertyRole, TeamResponse } from '@stay-flow/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button as AriaButton, MenuTrigger } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { formatDate, plural } from '@/lib/format';
import { Button } from '@/ui/button';
import { cx } from '@/ui/cx';
import { ChevronDownIcon, PlusIcon } from '@/ui/icons';
import { Menu, MenuItem } from '@/ui/menu';
import { Notice, type NoticeMessage } from '@/ui/notice';
import { Skeleton } from '@/ui/skeleton';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { canManage } from '../permissions';
import { initialsOf, roleLabel, rolePlace, roles } from '../roles';
import { AddMemberDialog } from './add-member-dialog';
import { RemoveMemberDialog } from './remove-member-dialog';

export interface TeamViewProps {
  /** Read by the server for the first paint. */
  initial: TeamResponse;
}

/** Who runs the property and what each of them may do. Only owners change it. */
export function TeamView({ initial }: TeamViewProps) {
  const { user, property } = useHost();
  const router = useRouter();
  const queryClient = useQueryClient();
  const editable = canManage(property.role, 'team');
  const { data } = useQuery({
    queryKey: hostKeys.team(property.id),
    queryFn: ({ signal }) => api('listTeam', { params: { propertyId: property.id }, signal }),
    initialData: initial,
  });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MemberResponse | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const done = (text: string) => {
    setNotice({ text, tone: 'done' });
  };

  const changeRole = useMutation({
    mutationFn: ({ member, role }: { member: MemberResponse; role: PropertyRole }) =>
      api('changeMemberRole', {
        params: { propertyId: property.id, userId: member.userId },
        body: { role },
      }),
    onSuccess: async (changed) => {
      done(
        `${changed.userId === user.id ? 'You are' : `${changed.name} is`} now ${rolePlace(changed.role)}.`,
      );
      await queryClient.invalidateQueries({ queryKey: hostKeys.team(property.id) });
      // Your own role decides what the whole dashboard shows.
      if (changed.userId === user.id) router.refresh();
    },
    onError: (error) => {
      setNotice({
        text: isApiError(error, 'LAST_OWNER')
          ? 'Every property needs an owner. Make someone else an owner first.'
          : 'We could not change the role. Nothing has changed. Try again in a moment.',
        tone: 'warning',
      });
    },
  });

  const { members } = data;
  // The API refuses to leave a property without an owner, so the page does not offer it.
  const owners = members.filter((member) => member.role === 'owner').length;
  const soleOwner = (member: MemberResponse) => member.role === 'owner' && owners === 1;
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-label tracking-[0.04em] text-ink-3 uppercase">
            {property.name} · {plural(members.length, 'person', 'people')}
          </p>
          <h1 className="font-display text-[2.5rem] leading-none font-normal tracking-[-0.02em]">
            Team
          </h1>
        </div>
        {editable ? (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              setAdding(true);
            }}
          >
            <PlusIcon className="size-4" />
            Add a person
          </Button>
        ) : (
          <p className="text-small text-ink-3">Only owners can change the team.</p>
        )}
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ul
          aria-label="People on the team"
          className="@container divide-y divide-rule rounded-lg border border-rule bg-paper"
        >
          {members.map((member) => (
            <li
              key={member.userId}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-5 py-4 @lg:grid-cols-[auto_minmax(0,1fr)_auto] @lg:px-6"
            >
              <span
                aria-hidden="true"
                className={cx(
                  'flex size-11 items-center justify-center rounded-full font-mono text-small font-medium',
                  member.role === 'owner'
                    ? 'bg-tape-in text-tape-in-ink'
                    : 'border border-rule-strong bg-raised text-ink-2',
                )}
              >
                {initialsOf(member.name)}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold">{member.name}</span>
                  {member.userId === user.id && (
                    <span className="shrink-0 rounded-sm border border-ink px-1.5 font-mono text-[0.625rem] leading-4 uppercase">
                      You
                    </span>
                  )}
                </p>
                <p className="text-small text-ink-3 @lg:truncate">
                  <span className="block truncate @lg:inline">{member.email}</span>
                  <span className="hidden @lg:inline"> · since </span>
                  <span className="@lg:hidden">On the team since </span>
                  {formatDate(member.since.slice(0, 10), 'monthYear')}
                </p>
              </div>
              <div className="col-span-2 flex items-center justify-end gap-2 @lg:col-span-1">
                {editable ? (
                  <>
                    <RoleMenu
                      member={member}
                      soleOwner={soleOwner(member)}
                      isPending={
                        changeRole.isPending && changeRole.variables.member.userId === member.userId
                      }
                      onChange={(role) => {
                        changeRole.mutate({ member, role });
                      }}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Remove ${member.name}`}
                      onPress={() => {
                        setRemoving(member);
                      }}
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <span className="rounded-sm border border-rule-strong px-2.5 py-1 text-label font-medium text-ink-2">
                    {roleLabel(member.role)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>

        <aside
          aria-labelledby="roles-title"
          className="flex flex-col gap-4 rounded-lg border border-dashed border-rule-strong p-5"
        >
          <h2 id="roles-title" className="font-mono text-[0.6875rem] text-ink-3 uppercase">
            What each role can do
          </h2>
          <dl className="grid gap-3.5 sm:grid-cols-3 sm:gap-6 xl:grid-cols-1 xl:gap-3.5">
            {roles.map(({ role, can }) => (
              <div key={role} className="flex flex-col gap-0.5">
                <dt className="text-small font-semibold">{roleLabel(role)}</dt>
                <dd className="text-small text-ink-2">{can}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-rule pt-3.5 text-small text-ink-3">
            Everyone can see the team. A property always keeps at least one owner.
          </p>
        </aside>
      </div>

      <Notice
        message={notice}
        onDismiss={() => {
          setNotice(null);
        }}
      />
      <AddMemberDialog isOpen={adding} onOpenChange={setAdding} onAdded={done} />
      {removing && (
        <RemoveMemberDialog
          member={removing}
          soleOwner={soleOwner(removing)}
          onClose={() => {
            setRemoving(null);
          }}
          onRemoved={(message) => {
            if (removing.userId === user.id) {
              router.push('/host');
              return;
            }
            done(message);
          }}
        />
      )}
    </div>
  );
}

interface RoleMenuProps {
  member: MemberResponse;
  /** The only owner keeps the role until someone else is an owner too. */
  soleOwner: boolean;
  isPending: boolean;
  onChange: (role: PropertyRole) => void;
}

function RoleMenu({ member, soleOwner, isPending, onChange }: RoleMenuProps) {
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={`Role of ${member.name}: ${roleLabel(member.role)}. Change role`}
        isPending={isPending}
        className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-rule-strong bg-raised px-3.5 text-small font-semibold text-ink outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-hovered:border-field-edge data-pending:cursor-progress data-pending:opacity-60"
      >
        {roleLabel(member.role)}
        <ChevronDownIcon className="size-4 text-ink-2" />
      </AriaButton>
      <Menu
        aria-label={`Role of ${member.name}`}
        placement="bottom end"
        selectionMode="single"
        selectedKeys={[member.role]}
        disallowEmptySelection
        disabledKeys={
          soleOwner ? roles.filter(({ role }) => role !== 'owner').map(({ role }) => role) : []
        }
        className="w-72"
        onSelectionChange={(keys) => {
          if (keys === 'all') return;
          const [role] = keys;
          const picked = roles.find((option) => option.role === role);
          if (picked && picked.role !== member.role) onChange(picked.role);
        }}
      >
        {roles.map(({ role, can }) => (
          <MenuItem
            key={role}
            id={role}
            description={soleOwner && role !== 'owner' ? 'Make someone else an owner first.' : can}
          >
            {roleLabel(role)}
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}

export function TeamSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the team"
      className="flex flex-col gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
