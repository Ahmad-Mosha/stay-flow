'use client';

import type { BlockResponse, RoomCalendarResponse } from '@stay-flow/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button as AriaButton, Form } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { formatDate, plural } from '@/lib/format';
import { Button } from '@/ui/button';
import { DateRangeField, type DateRange } from '@/ui/date-range-field';
import { Dialog } from '@/ui/dialog';
import { Select, SelectGroup, SelectItem } from '@/ui/select';
import { TextField } from '@/ui/text-field';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { addDays, daysBetween } from './tape';

/** What the dialog opens with, such as the nights a host dragged across on the chart. */
export interface BlockDraft {
  unitId?: string;
  nights?: { from: string; to: string };
}

interface BlockDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The property's rooms, by type. */
  rooms: RoomCalendarResponse['unitTypes'];
  today: string;
  draft: BlockDraft | null;
  onBlocked: (block: BlockResponse, message: string) => void;
}

const reasons = ['Repairs', 'Deep clean', 'Owner staying', 'Painting'];

/** Takes a room out of service for some nights, with the reason the team will see. */
export function BlockDialog({ isOpen, onOpenChange, ...props }: BlockDialogProps) {
  return (
    <Dialog title="Block dates" isOpen={isOpen} onOpenChange={onOpenChange}>
      {(close) => <BlockForm {...props} close={close} />}
    </Dialog>
  );
}

function BlockForm({
  rooms,
  today,
  draft,
  onBlocked,
  close,
}: Omit<BlockDialogProps, 'isOpen' | 'onOpenChange'> & { close: () => void }) {
  const { property } = useHost();
  const queryClient = useQueryClient();
  const [unitId, setUnitId] = useState<string | null>(draft?.unitId ?? null);
  const [range, setRange] = useState<DateRange | null>(
    draft?.nights ? { start: draft.nights.from, end: draft.nights.to } : null,
  );
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const room = rooms.flatMap((type) => type.units).find((unit) => unit.id === unitId);

  const block = useMutation({
    mutationFn: (input: { unitId: string; nights: { from: string; to: string } }) =>
      api('createBlock', {
        params: { propertyId: property.id },
        body: { ...input, reason: reason.trim() },
      }),
    onSuccess: async (created) => {
      const nights = daysBetween(created.nights.from, created.nights.to);
      close();
      onBlocked(
        created,
        `Room ${room?.name ?? ''} is blocked for ${plural(nights, 'night')} from ${formatDate(created.nights.from)}.`,
      );
      await queryClient.invalidateQueries({ queryKey: hostKeys.property(property.id) });
    },
  });

  const nights = range ? daysBetween(range.start, range.end) : 0;
  const lastNight = range ? addDays(range.end, -1) : null;
  const rangeHelp =
    range && lastNight
      ? `${plural(nights, 'night')}: ${lastNight === range.start ? formatDate(range.start) : `${formatDate(range.start)} to ${formatDate(lastNight)}`}. Back on sale ${formatDate(range.end)}.`
      : 'Pick the first night, then the day the room is back on sale.';

  return (
    <Form
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (!unitId || !range || !reason.trim()) return;
        block.mutate({ unitId, nights: { from: range.start, to: range.end } });
      }}
      className="flex flex-col gap-5"
    >
      <p className="text-small text-ink-2">
        Guests cannot book the room on these nights. Bookings already on them stay as they are, so
        pick nights the room is free.
      </p>
      <Select
        label="Room"
        value={unitId}
        onChange={(key) => {
          setUnitId(typeof key === 'string' ? key : null);
        }}
        isRequired
        isDisabled={block.isPending}
        isInvalid={attempted && !unitId}
        errorMessage="Choose the room to block"
      >
        {rooms.map((type) => (
          <SelectGroup key={type.id} title={type.name}>
            {type.units.map((unit) => (
              <SelectItem key={unit.id} id={unit.id} textValue={`Room ${unit.name}`}>
                Room {unit.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </Select>
      <DateRangeField
        label="Nights"
        description={rangeHelp}
        value={range}
        onChange={setRange}
        minValue={today}
        isRequired
        isDisabled={block.isPending}
        isInvalid={attempted && !range}
        errorMessage="Pick the nights to block"
      />
      <div className="flex flex-col gap-2.5">
        <TextField
          label="Reason"
          description="The team sees it on the calendar."
          value={reason}
          onChange={setReason}
          maxLength={200}
          isRequired
          isDisabled={block.isPending}
          validate={(value) => (attempted && !value.trim() ? 'Say why, for the team' : null)}
        />
        <div role="group" aria-label="Common reasons" className="flex flex-wrap gap-2">
          {reasons.map((suggestion) => (
            <AriaButton
              key={suggestion}
              isDisabled={block.isPending}
              onPress={() => {
                setReason(suggestion);
              }}
              className="h-8 cursor-pointer rounded-full border border-rule px-3 text-label font-medium text-ink-2 outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-hovered:border-field-edge data-hovered:text-ink"
            >
              {suggestion}
            </AriaButton>
          ))}
        </div>
      </div>
      {block.isError && (
        <p role="alert" className="text-small text-danger">
          {isApiError(block.error, 'UNIT_TAKEN')
            ? `Room ${room?.name ?? ''} is not free on all of those nights. Pick other nights or another room.`
            : isApiError(block.error, 'BLOCK_IN_PAST')
              ? 'A block can start tonight at the earliest.'
              : 'We could not block the room. Nothing has changed. Try again in a moment.'}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" onPress={close} isDisabled={block.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" isPending={block.isPending}>
          {block.isPending ? 'Blocking' : nights > 0 ? `Block ${plural(nights, 'night')}` : 'Block'}
        </Button>
      </div>
    </Form>
  );
}
