'use client';

import type { HostUnitTypeResponse } from '@stay-flow/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Form } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { toMajor, toMinor } from '@/lib/format';
import { slugify } from '@/lib/slug';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { NumberField } from '@/ui/number-field';
import { TextField } from '@/ui/text-field';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';

interface UnitTypeDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The room type to change, or null to add one. */
  unitType: HostUnitTypeResponse | null;
  onSaved: (message: string) => void;
}

/** Adds a room type, or changes one's name, description, guests and base rate. */
export function UnitTypeDialog({ isOpen, onOpenChange, unitType, onSaved }: UnitTypeDialogProps) {
  return (
    <Dialog
      title={unitType ? `Edit ${unitType.name}` : 'Add a room type'}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      {(close) => <UnitTypeForm unitType={unitType} onSaved={onSaved} close={close} />}
    </Dialog>
  );
}

function UnitTypeForm({
  unitType,
  onSaved,
  close,
}: Pick<UnitTypeDialogProps, 'unitType' | 'onSaved'> & { close: () => void }) {
  const { property } = useHost();
  const queryClient = useQueryClient();
  const [name, setName] = useState(unitType?.name ?? '');
  // The address follows the name until the host edits it.
  const [slug, setSlug] = useState<string | null>(null);
  const [description, setDescription] = useState(unitType?.description ?? '');
  const [maxGuests, setMaxGuests] = useState(unitType?.maxGuests ?? 2);
  const [rate, setRate] = useState(
    unitType ? toMajor(unitType.baseRateMinor, property.currency) : Number.NaN,
  );
  const [attempted, setAttempted] = useState(false);
  const address = slugify(slug ?? name);

  const save = useMutation({
    mutationFn: () => {
      const details = {
        name: name.trim(),
        description: description.trim(),
        maxGuests,
        baseRateMinor: toMinor(rate, property.currency),
      };
      return unitType
        ? api('updateUnitType', {
            params: { propertyId: property.id, unitTypeId: unitType.id },
            body: details,
          })
        : api('createUnitType', {
            params: { propertyId: property.id },
            body: { ...details, slug: address },
          });
    },
    onSuccess: async (saved) => {
      close();
      onSaved(unitType ? `${saved.name} is saved.` : `${saved.name} is added. Add its rooms next.`);
      await queryClient.invalidateQueries({ queryKey: hostKeys.property(property.id) });
    },
  });

  const rateMissing = !Number.isFinite(rate);
  return (
    <Form
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (!name.trim() || !address || rateMissing) return;
        save.mutate();
      }}
      className="flex flex-col gap-5"
    >
      <TextField
        label="Name"
        description="As guests see it, such as “Garden Double”."
        value={name}
        onChange={setName}
        maxLength={120}
        isRequired
        isDisabled={save.isPending}
        validate={(value) => (attempted && !value.trim() ? 'Name the room type' : null)}
      />
      {!unitType && (
        <TextField
          label="Web address"
          description={`In booking links, after /stay/${property.slug}. It cannot change later.`}
          value={slug ?? address}
          onChange={(value) => {
            setSlug(value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
          }}
          maxLength={64}
          isRequired
          isDisabled={save.isPending}
          validate={(value) =>
            attempted && !slugify(value) ? 'Use letters or numbers, such as “garden-double”' : null
          }
        />
      )}
      <TextField
        multiline
        label="Description"
        description="Optional. What makes it worth booking: the view, the bed, the bathroom."
        value={description}
        onChange={setDescription}
        maxLength={2000}
        isDisabled={save.isPending}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <NumberField
          label="Guests per room"
          value={maxGuests}
          onChange={(value) => {
            if (Number.isInteger(value)) setMaxGuests(value);
          }}
          minValue={1}
          maxValue={20}
          isRequired
          isDisabled={save.isPending}
        />
        <NumberField
          label="Base rate a night"
          suffix={property.currency}
          value={rate}
          onChange={setRate}
          minValue={0}
          formatOptions={{ maximumFractionDigits: 2 }}
          isRequired
          isDisabled={save.isPending}
          isInvalid={attempted && rateMissing}
          errorMessage="Set the nightly rate"
        />
      </div>
      <p className="text-small text-ink-3">
        The base rate applies on every night without a seasonal rate. Bookings already made keep
        their prices.
      </p>
      {save.isError && (
        <p role="alert" className="text-small text-danger">
          {isApiError(save.error, 'SLUG_TAKEN')
            ? 'Another room type here already uses this web address. Pick another.'
            : 'We could not save the room type. Nothing has changed. Try again in a moment.'}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" onPress={close} isDisabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" isPending={save.isPending}>
          {save.isPending ? 'Saving' : unitType ? 'Save' : 'Add room type'}
        </Button>
      </div>
    </Form>
  );
}
