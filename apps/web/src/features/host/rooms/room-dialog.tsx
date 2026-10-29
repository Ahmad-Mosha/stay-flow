'use client';

import type { HostUnitTypeResponse } from '@stay-flow/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Form } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { TextField } from '@/ui/text-field';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';

/** A room to rename, or the type to add one to. */
export type RoomTarget =
  | { kind: 'add'; unitType: HostUnitTypeResponse }
  | { kind: 'rename'; unitType: HostUnitTypeResponse; room: { id: string; name: string } };

interface RoomDialogProps {
  target: RoomTarget;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Adds a room to a type, or renames one. A room's name is what the team calls it, like 101. */
export function RoomDialog({ target, onClose, onSaved }: RoomDialogProps) {
  return (
    <Dialog
      title={target.kind === 'rename' ? `Rename room ${target.room.name}` : 'Add a room'}
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      {(close) => <RoomForm target={target} onSaved={onSaved} close={close} />}
    </Dialog>
  );
}

function RoomForm({
  target,
  onSaved,
  close,
}: {
  target: RoomTarget;
  onSaved: (message: string) => void;
  close: () => void;
}) {
  const { property } = useHost();
  const queryClient = useQueryClient();
  const [name, setName] = useState(target.kind === 'rename' ? target.room.name : '');
  const [attempted, setAttempted] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      target.kind === 'rename'
        ? api('updateUnit', {
            params: { propertyId: property.id, unitId: target.room.id },
            body: { name: name.trim() },
          })
        : api('createUnit', {
            params: { propertyId: property.id },
            body: { unitTypeId: target.unitType.id, name: name.trim() },
          }),
    onSuccess: async (room) => {
      close();
      onSaved(
        target.kind === 'rename'
          ? `Room ${target.room.name} is now room ${room.name}.`
          : `Room ${room.name} is added to ${target.unitType.name}. Guests can book it now.`,
      );
      await queryClient.invalidateQueries({ queryKey: hostKeys.property(property.id) });
    },
  });

  return (
    <Form
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (!name.trim()) return;
        save.mutate();
      }}
      className="flex flex-col gap-5"
    >
      <p className="text-small text-ink-2">
        {target.kind === 'rename'
          ? 'Bookings in this room stay as they are; they show the new name.'
          : `A ${target.unitType.name} room, at its rates. It goes on sale as soon as it is added.`}
      </p>
      <TextField
        label="Room name"
        description="What the team calls it, such as 105 or Garden Suite."
        value={name}
        onChange={(value) => {
          setName(value);
          // The error names what was typed, so it goes once the name changes.
          save.reset();
        }}
        maxLength={40}
        isRequired
        isDisabled={save.isPending}
        validate={(value) => (attempted && !value.trim() ? 'Name the room' : null)}
      />
      {save.isError && (
        <p role="alert" className="text-small text-danger">
          {isApiError(save.error, 'UNIT_NAME_TAKEN')
            ? `Another room here is already called ${name.trim()}.`
            : 'We could not save the room. Nothing has changed. Try again in a moment.'}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" onPress={close} isDisabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" isPending={save.isPending}>
          {save.isPending ? 'Saving' : target.kind === 'rename' ? 'Rename' : 'Add room'}
        </Button>
      </div>
    </Form>
  );
}
