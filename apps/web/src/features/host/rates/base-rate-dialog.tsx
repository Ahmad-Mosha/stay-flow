'use client';

import type { HostUnitTypeResponse } from '@stay-flow/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Form } from 'react-aria-components';
import { api } from '@/api/client';
import { formatMoney, toMajor, toMinor } from '@/lib/format';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { NumberField } from '@/ui/number-field';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';

interface BaseRateDialogProps {
  unitType: HostUnitTypeResponse;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * Changes what a room type costs a night when no seasonal rate covers the night. Mounted only
 * while open, so each opening starts from the saved rate.
 */
export function BaseRateDialog({ unitType, onClose, onSaved }: BaseRateDialogProps) {
  return (
    <Dialog
      title={`Base rate for ${unitType.name}`}
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      {(close) => <BaseRateForm unitType={unitType} onSaved={onSaved} close={close} />}
    </Dialog>
  );
}

function BaseRateForm({
  unitType,
  onSaved,
  close,
}: {
  unitType: HostUnitTypeResponse;
  onSaved: (message: string) => void;
  close: () => void;
}) {
  const { property } = useHost();
  const queryClient = useQueryClient();
  const [rate, setRate] = useState(toMajor(unitType.baseRateMinor, property.currency));
  const rateMissing = !Number.isFinite(rate);

  const save = useMutation({
    mutationFn: () =>
      api('updateUnitType', {
        params: { propertyId: property.id, unitTypeId: unitType.id },
        body: { baseRateMinor: toMinor(rate, property.currency) },
      }),
    onSuccess: async (saved) => {
      close();
      onSaved(
        `${saved.name} now sells at ${formatMoney(saved.baseRateMinor, property.currency)} a night.`,
      );
      await queryClient.invalidateQueries({ queryKey: hostKeys.property(property.id) });
    },
  });

  return (
    <Form
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        if (rateMissing) return;
        save.mutate();
      }}
      className="flex flex-col gap-5"
    >
      <NumberField
        label="Rate a night"
        description="On every night without a seasonal rate. Bookings already made keep their prices."
        suffix={property.currency}
        value={rate}
        onChange={setRate}
        minValue={0}
        formatOptions={{ maximumFractionDigits: 2 }}
        isRequired
        isDisabled={save.isPending}
        isInvalid={rateMissing}
        errorMessage="Set the nightly rate"
      />
      {save.isError && (
        <p role="alert" className="text-small text-danger">
          We could not save the rate. Nothing has changed. Try again in a moment.
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" onPress={close} isDisabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" isPending={save.isPending}>
          {save.isPending ? 'Saving' : 'Save rate'}
        </Button>
      </div>
    </Form>
  );
}
