'use client';

import type { HostUnitTypeListResponse, HostUnitTypeResponse } from '@stay-flow/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { api } from '@/api/client';
import { formatMoney, plural } from '@/lib/format';
import { Button } from '@/ui/button';
import { PencilIcon, PlusIcon } from '@/ui/icons';
import { Notice, type NoticeMessage } from '@/ui/notice';
import { Skeleton } from '@/ui/skeleton';
import { StatePanel } from '@/ui/state-panel';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { canManage } from '../permissions';
import { RoomDialog, type RoomTarget } from './room-dialog';
import { UnitTypeDialog } from './unit-type-dialog';

export interface RoomsViewProps {
  /** Read by the server for the first paint. */
  initial: HostUnitTypeListResponse;
}

/** The room types guests book, and the rooms of each that the team assigns. */
export function RoomsView({ initial }: RoomsViewProps) {
  const { property } = useHost();
  const editable = canManage(property.role, 'inventory');
  const { data } = useQuery({
    queryKey: hostKeys.unitTypes(property.id),
    queryFn: ({ signal }) => api('listUnitTypes', { params: { propertyId: property.id }, signal }),
    initialData: initial,
  });
  const [editing, setEditing] = useState<{ unitType: HostUnitTypeResponse | null } | null>(null);
  const [roomTarget, setRoomTarget] = useState<RoomTarget | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const saved = (text: string) => {
    setNotice({ text, tone: 'done' });
  };
  const { unitTypes } = data;
  const roomCount = unitTypes.reduce((count, unitType) => count + unitType.units.length, 0);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-label tracking-[0.04em] text-ink-3 uppercase">
            {property.name} · {plural(roomCount, 'room')} in {plural(unitTypes.length, 'type')}
          </p>
          <h1 className="font-display text-[2.5rem] leading-none font-normal tracking-[-0.02em]">
            Rooms
          </h1>
        </div>
        {editable ? (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              setEditing({ unitType: null });
            }}
          >
            <PlusIcon className="size-4" />
            Add room type
          </Button>
        ) : (
          <p className="text-small text-ink-3">Only owners and managers can change rooms.</p>
        )}
      </header>

      {unitTypes.length === 0 ? (
        <StatePanel
          eyebrow="Nothing to book yet"
          title="Add your first room type"
          action={
            editable && (
              <Button
                onPress={() => {
                  setEditing({ unitType: null });
                }}
              >
                Add a room type
              </Button>
            )
          }
        >
          A room type is what guests book, such as “Garden Double”. Then add the rooms of that type,
          such as 101 and 102, and they go on sale.
        </StatePanel>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {unitTypes.map((unitType) => (
            <UnitTypeCard
              key={unitType.id}
              unitType={unitType}
              currency={property.currency}
              editable={editable}
              onEdit={() => {
                setEditing({ unitType });
              }}
              onRoom={setRoomTarget}
            />
          ))}
        </div>
      )}

      <Notice
        message={notice}
        onDismiss={() => {
          setNotice(null);
        }}
      />
      {editing && (
        <UnitTypeDialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setEditing(null);
          }}
          unitType={editing.unitType}
          onSaved={saved}
        />
      )}
      {roomTarget && (
        <RoomDialog
          target={roomTarget}
          onClose={() => {
            setRoomTarget(null);
          }}
          onSaved={saved}
        />
      )}
    </div>
  );
}

interface UnitTypeCardProps {
  unitType: HostUnitTypeResponse;
  currency: string;
  editable: boolean;
  onEdit: () => void;
  onRoom: (target: RoomTarget) => void;
}

function UnitTypeCard({ unitType, currency, editable, onEdit, onRoom }: UnitTypeCardProps) {
  const titleId = `unit-type-${unitType.id}`;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-5 rounded-lg border border-rule bg-paper p-5 sm:p-6"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="font-display text-headline font-normal">
            {unitType.name}
          </h2>
          <p className="truncate font-mono text-label text-ink-3">/{unitType.slug}</p>
        </div>
        {editable && (
          <Button
            variant="secondary"
            size="sm"
            onPress={onEdit}
            aria-label={`Edit ${unitType.name}`}
          >
            <PencilIcon className="size-4" />
            Edit
          </Button>
        )}
      </header>

      <dl className="grid grid-cols-3 divide-x divide-rule rounded-md border border-rule">
        <Fact label="Base rate">{formatMoney(unitType.baseRateMinor, currency)}</Fact>
        <Fact label="Sleeps">{plural(unitType.maxGuests, 'guest')}</Fact>
        <Fact label="Rooms">{unitType.units.length}</Fact>
      </dl>

      {unitType.description && (
        <p className="line-clamp-3 text-small text-ink-2">{unitType.description}</p>
      )}

      <div className="flex flex-col gap-2.5">
        <h3 className="font-mono text-[0.6875rem] text-ink-3 uppercase">Rooms</h3>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
          {unitType.units.map((room) => (
            <li key={room.id}>
              {editable ? (
                <AriaButton
                  aria-label={`Rename room ${room.name}`}
                  onPress={() => {
                    onRoom({ kind: 'rename', unitType, room });
                  }}
                  className="group flex h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-rule-strong bg-raised px-3 font-mono text-small text-ink outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-hovered:border-field-edge"
                >
                  <span className="truncate">{room.name}</span>
                  <PencilIcon className="size-3.5 text-ink-3 opacity-0 transition-opacity group-data-focus-visible:opacity-100 group-data-hovered:opacity-100" />
                </AriaButton>
              ) : (
                <span className="flex h-12 items-center rounded-md border border-rule-strong bg-raised px-3 font-mono text-small">
                  {room.name}
                </span>
              )}
            </li>
          ))}
          {editable && (
            <li>
              <AriaButton
                onPress={() => {
                  onRoom({ kind: 'add', unitType });
                }}
                aria-label={`Add a ${unitType.name} room`}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-rule-strong text-label font-medium text-ink-2 outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-hovered:border-field-edge data-hovered:text-ink"
              >
                <PlusIcon className="size-4" />
                Add
              </AriaButton>
            </li>
          )}
        </ul>
        {unitType.units.length === 0 && (
          <p className="text-small text-ink-3">
            No rooms yet, so guests cannot book this type. Add the first one.
          </p>
        )}
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-3.5 py-3">
      <dt className="font-mono text-[0.6875rem] text-ink-3 uppercase">{label}</dt>
      <dd className="numerals truncate text-small font-semibold">{children}</dd>
    </div>
  );
}

export function RoomsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading rooms"
      className="flex flex-col gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </div>
  );
}
