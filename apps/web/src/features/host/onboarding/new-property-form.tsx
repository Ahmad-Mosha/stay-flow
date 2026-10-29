'use client';

import { reservedPropertySlugs } from '@stay-flow/contracts';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Form } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { routes } from '@/lib/routes';
import { slugify } from '@/lib/slug';
import { Button } from '@/ui/button';
import { ComboBox, ComboBoxItem } from '@/ui/combo-box';
import { TextField } from '@/ui/text-field';
import { currencyOptions, useDeviceTimeZone, zoneOptions } from './places';
import { PropertyPreview } from './property-preview';

/** Names the property, picks its booking page address, time zone and currency, then opens it. */
export function NewPropertyForm() {
  const router = useRouter();
  const zones = useMemo(() => zoneOptions(), []);
  const currencies = useMemo(() => currencyOptions(), []);
  const deviceZone = useDeviceTimeZone();

  const [name, setName] = useState('');
  // The address follows the name until the host edits it.
  const [slug, setSlug] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const address = slugify(slug ?? name);
  // The device's own zone is the likely answer, when the list knows it.
  const timeZone = zone ?? zones.find(({ id }) => id === deviceZone)?.id ?? null;

  const create = useMutation({
    mutationFn: () => {
      if (!timeZone || !currency) throw new Error('The form is not complete');
      return api('createProperty', {
        body: { name: name.trim(), slug: address, timeZone, currency },
      });
    },
    onSuccess: (property) => {
      router.push(routes.today(property.slug));
      router.refresh();
    },
  });
  // Stays busy after success too, while the dashboard loads.
  const busy = create.isPending || create.isSuccess;
  const slugTaken = isApiError(create.error, 'SLUG_TAKEN');

  const problems = {
    name: name.trim() ? null : 'Name the property',
    slug: !address
      ? 'Use letters or numbers, such as “dar-nubia”'
      : reservedPropertySlugs.includes(address)
        ? `/stay/${address} is kept for Stay Flow. Try another address.`
        : null,
    zone: timeZone ? null : 'Pick the time zone the property is in',
    currency: currency ? null : 'Pick the currency guests pay in',
  };
  const shown = attempted ? problems : { name: null, slug: null, zone: null, currency: null };

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] xl:gap-16">
      <Form
        aria-label="New property"
        validationBehavior="aria"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          // Rendered at once, so the first field marked invalid can take the focus.
          flushSync(() => {
            setAttempted(true);
          });
          if (Object.values(problems).some(Boolean)) {
            form.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus();
            return;
          }
          if (!busy) create.mutate();
        }}
        className="flex flex-col gap-6"
      >
        <TextField
          label="Property name"
          description="As guests see it on the booking page and in their emails."
          value={name}
          onChange={setName}
          maxLength={120}
          isRequired
          isDisabled={busy}
          isInvalid={Boolean(shown.name)}
          errorMessage={shown.name ?? undefined}
        />
        <TextField
          label="Booking page address"
          description={`Guests book at /stay/${address || 'your-property'}. It cannot change later.`}
          value={slug ?? address}
          onChange={(value) => {
            setSlug(value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
            create.reset();
          }}
          maxLength={64}
          isRequired
          isDisabled={busy}
          isInvalid={Boolean(shown.slug) || slugTaken}
          errorMessage={
            shown.slug ??
            (slugTaken ? `Another property already uses /stay/${address}. Try another.` : undefined)
          }
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <ComboBox
            label="Time zone"
            placeholder="Search a city"
            defaultItems={zones}
            value={timeZone}
            onChange={(key) => {
              if (typeof key === 'string') setZone(key);
            }}
            isRequired
            isDisabled={busy}
            isInvalid={Boolean(shown.zone)}
            errorMessage={shown.zone ?? undefined}
          >
            {(option) => (
              <ComboBoxItem id={option.id} textValue={option.name} detail={option.offset}>
                {option.name}
              </ComboBoxItem>
            )}
          </ComboBox>
          <ComboBox
            label="Currency"
            placeholder="Search, such as EGP"
            defaultItems={currencies}
            value={currency}
            onChange={(key) => {
              if (typeof key === 'string') setCurrency(key);
            }}
            isRequired
            isDisabled={busy}
            isInvalid={Boolean(shown.currency)}
            errorMessage={shown.currency ?? undefined}
          >
            {(option) => (
              <ComboBoxItem
                id={option.id}
                textValue={`${option.name} (${option.id})`}
                detail={option.id}
              >
                {option.name}
              </ComboBoxItem>
            )}
          </ComboBox>
        </div>
        <p className="rounded-md border border-dashed border-rule-strong px-4 py-3 text-small text-ink-2">
          The time zone and currency stay as they are once the property is open: every date and
          price depends on them.
        </p>
        {create.isError && !slugTaken && (
          <p role="alert" className="text-small text-danger">
            {isApiError(create.error, 'RATE_LIMITED')
              ? 'Too many attempts in a short time. Wait a minute, then try again.'
              : 'We could not create the property. Nothing has changed. Try again in a moment.'}
          </p>
        )}
        <Button type="submit" size="lg" isPending={busy} className="w-full sm:w-auto sm:self-start">
          {busy ? 'Creating your property' : 'Create property'}
        </Button>
      </Form>

      <PropertyPreview name={name.trim()} slug={address} timeZone={timeZone} currency={currency} />
    </div>
  );
}
