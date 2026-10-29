'use client';

import type { HostUnitTypeResponse } from '@stay-flow/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button as AriaButton, Form } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { formatDate, formatMoney, plural, toMinor } from '@/lib/format';
import { Button } from '@/ui/button';
import { DateRangeField, type DateRange } from '@/ui/date-range-field';
import { Dialog } from '@/ui/dialog';
import { NumberField } from '@/ui/number-field';
import { Select, SelectItem } from '@/ui/select';
import { TextField } from '@/ui/text-field';
import { addDays, daysBetween } from '../calendar/tape';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { rateChange } from './seasons';

interface SeasonDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  unitTypes: HostUnitTypeResponse[];
  today: string;
  onAdded: (message: string) => void;
}

const labels = ['Winter holidays', 'Summer', 'Eid', 'Low season'];

/** Sets another nightly rate for one room type on chosen nights, such as the winter holidays. */
export function SeasonDialog({ isOpen, onOpenChange, ...props }: SeasonDialogProps) {
  return (
    <Dialog title="Add a seasonal rate" isOpen={isOpen} onOpenChange={onOpenChange}>
      {(close) => <SeasonForm {...props} close={close} />}
    </Dialog>
  );
}

function SeasonForm({
  unitTypes,
  today,
  onAdded,
  close,
}: Omit<SeasonDialogProps, 'isOpen' | 'onOpenChange'> & { close: () => void }) {
  const { property } = useHost();
  const queryClient = useQueryClient();
  const [unitTypeId, setUnitTypeId] = useState<string | null>(
    unitTypes.length === 1 ? (unitTypes[0]?.id ?? null) : null,
  );
  const [range, setRange] = useState<DateRange | null>(null);
  const [rate, setRate] = useState(Number.NaN);
  const [label, setLabel] = useState('');
  const [attempted, setAttempted] = useState(false);
  const unitType = unitTypes.find((type) => type.id === unitTypeId);
  const rateMissing = !Number.isFinite(rate);

  const add = useMutation({
    mutationFn: (input: { unitTypeId: string; nights: { from: string; to: string } }) =>
      api('createRateOverride', {
        params: { propertyId: property.id },
        body: { ...input, rateMinor: toMinor(rate, property.currency), label: label.trim() },
      }),
    onSuccess: async (season) => {
      close();
      onAdded(
        `${season.label}: ${unitType?.name ?? ''} sells at ${formatMoney(season.rateMinor, property.currency)} from ${formatDate(season.nights.from)}.`,
      );
      await queryClient.invalidateQueries({ queryKey: hostKeys.property(property.id) });
    },
  });

  const nights = range ? daysBetween(range.start, range.end) : 0;
  const rangeHelp = range
    ? `${plural(nights, 'night')}, last one ${formatDate(addDays(range.end, -1))}. The base rate is back ${formatDate(range.end)}.`
    : 'Pick the first night, then the day the base rate is back.';
  const change =
    unitType && !rateMissing
      ? rateChange(toMinor(rate, property.currency), unitType.baseRateMinor)
      : null;
  const rateHelp = unitType
    ? `The base rate is ${formatMoney(unitType.baseRateMinor, property.currency)}${
        change === null || change === 0
          ? '.'
          : `, so this is ${Math.abs(change)}% ${change > 0 ? 'more' : 'less'}.`
      }`
    : 'What guests pay a night instead of the base rate.';

  return (
    <Form
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (!unitTypeId || !range || rateMissing || !label.trim()) return;
        add.mutate({ unitTypeId, nights: { from: range.start, to: range.end } });
      }}
      className="flex flex-col gap-5"
    >
      <p className="text-small text-ink-2">
        On these nights the room type sells at this rate instead of its base rate. Bookings already
        made keep their prices.
      </p>
      <Select
        label="Room type"
        value={unitTypeId}
        onChange={(key) => {
          setUnitTypeId(typeof key === 'string' ? key : null);
        }}
        isRequired
        isDisabled={add.isPending}
        isInvalid={attempted && !unitTypeId}
        errorMessage="Choose the room type"
      >
        {unitTypes.map((type) => (
          <SelectItem
            key={type.id}
            id={type.id}
            textValue={type.name}
            detail={`Base ${formatMoney(type.baseRateMinor, property.currency)}`}
          >
            {type.name}
          </SelectItem>
        ))}
      </Select>
      <DateRangeField
        label="Nights"
        description={rangeHelp}
        value={range}
        onChange={setRange}
        minValue={today}
        isRequired
        isDisabled={add.isPending}
        isInvalid={attempted && !range}
        errorMessage="Pick the nights"
      />
      <NumberField
        label="Rate a night"
        description={rateHelp}
        suffix={property.currency}
        value={rate}
        onChange={setRate}
        minValue={0}
        formatOptions={{ maximumFractionDigits: 2 }}
        isRequired
        isDisabled={add.isPending}
        isInvalid={attempted && rateMissing}
        errorMessage="Set the nightly rate"
      />
      <div className="flex flex-col gap-2.5">
        <TextField
          label="Name"
          description="The team sees it beside the rate."
          value={label}
          onChange={setLabel}
          maxLength={80}
          isRequired
          isDisabled={add.isPending}
          validate={(value) => (attempted && !value.trim() ? 'Name the season' : null)}
        />
        <div role="group" aria-label="Common names" className="flex flex-wrap gap-2">
          {labels.map((suggestion) => (
            <AriaButton
              key={suggestion}
              isDisabled={add.isPending}
              onPress={() => {
                setLabel(suggestion);
              }}
              className="h-8 cursor-pointer rounded-full border border-rule px-3 text-label font-medium text-ink-2 outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-hovered:border-field-edge data-hovered:text-ink"
            >
              {suggestion}
            </AriaButton>
          ))}
        </div>
      </div>
      {add.isError && (
        <p role="alert" className="text-small text-danger">
          {isApiError(add.error, 'RATES_OVERLAP')
            ? `Another seasonal rate for ${unitType?.name ?? 'this room type'} already covers some of these nights. Pick other nights, or remove that rate first.`
            : 'We could not add the rate. Nothing has changed. Try again in a moment.'}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" onPress={close} isDisabled={add.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" isPending={add.isPending}>
          {add.isPending ? 'Adding' : 'Add rate'}
        </Button>
      </div>
    </Form>
  );
}
