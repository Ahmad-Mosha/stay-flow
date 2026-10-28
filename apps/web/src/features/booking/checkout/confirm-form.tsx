'use client';

import {
  confirmReservationRequestSchema,
  type ConfirmReservationRequest,
} from '@stay-flow/contracts';
import { useState } from 'react';
import { Form } from 'react-aria-components';
import { isApiError } from '@/api/client';
import { formatTime, zoneLabel } from '@/lib/format';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/text-field';
import { HoldFrame, HoldStatus } from './hold-timer';

interface ConfirmFormProps {
  expiresAt: number;
  heldAt: number;
  now: number;
  timeZone: string;
  pending: boolean;
  error: unknown;
  defaultValues: Partial<ConfirmReservationRequest> | undefined;
  onConfirm: (details: ConfirmReservationRequest) => void;
}

type Field = keyof ConfirmReservationRequest;

const fieldCopy: Record<Field, string> = {
  guestName: 'Enter the name the booking should be under',
  guestEmail: 'Enter an email address, like name@example.com',
};

/** The same rules the API applies, from the shared contract, with our own words. */
function checkField(field: Field, value: string): string | null {
  return confirmReservationRequestSchema.shape[field].safeParse(value).success
    ? null
    : fieldCopy[field];
}

/** The API names a rejected field by JSON pointer, as `#/guestEmail`; the copy is ours. */
function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error, 'VALIDATION_FAILED')) return {};
  const errors: Record<string, string> = {};
  for (const problem of error.errors) {
    const field = problem.pointer.replace('#/', '') as Field;
    if (field in fieldCopy) errors[field] = fieldCopy[field];
  }
  return errors;
}

export function ConfirmForm({
  expiresAt,
  heldAt,
  now,
  timeZone,
  pending,
  error,
  defaultValues,
  onConfirm,
}: ConfirmFormProps) {
  // Errors appear only after a first Confirm press, then clear as each field is fixed, while
  // typing. Clearing them on blur instead would shift the button away from a guest's click.
  const [attempted, setAttempted] = useState(false);
  const validate = (field: Field) => (value: string) =>
    attempted ? checkField(field, value.trim()) : null;
  const validationErrors = fieldErrors(error);
  const generalError =
    error && Object.keys(validationErrors).length === 0
      ? isApiError(error, 'IDEMPOTENCY_KEY_IN_USE')
        ? 'Your first press is still going through. Wait a few seconds, then press Confirm again.'
        : `We could not reach the booking system. Your room is still held until ${formatTime(expiresAt, timeZone)} ${zoneLabel(timeZone)}. Press Confirm again: you will not be booked twice.`
      : null;

  return (
    <Form
      aria-labelledby="details-title"
      validationBehavior="aria"
      validationErrors={validationErrors}
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        const form = event.currentTarget;
        const data = new FormData(form);
        const text = (name: Field) => {
          const value = data.get(name);
          return typeof value === 'string' ? value.trim() : '';
        };
        const details = { guestName: text('guestName'), guestEmail: text('guestEmail') };
        const invalid = (Object.keys(details) as Field[]).find((field) =>
          checkField(field, details[field]),
        );
        if (invalid) {
          form.querySelector<HTMLInputElement>(`input[name="${invalid}"]`)?.focus();
          return;
        }
        onConfirm(details);
      }}
      className="flex flex-col rounded-lg border border-rule bg-paper"
    >
      <fieldset className="flex flex-col gap-5 border-b border-rule px-5 pt-6 pb-7 sm:px-7">
        <legend
          id="details-title"
          className="float-left mb-1 w-full font-display text-headline font-normal"
        >
          Who is staying
        </legend>
        <TextField
          name="guestName"
          label="Full name"
          autoComplete="name"
          isRequired
          isDisabled={pending}
          defaultValue={defaultValues?.guestName ?? ''}
          validate={validate('guestName')}
        />
        <TextField
          name="guestEmail"
          type="email"
          label="Email"
          autoComplete="email"
          isRequired
          isDisabled={pending}
          defaultValue={defaultValues?.guestEmail ?? ''}
          validate={validate('guestEmail')}
          description="Your confirmation goes here, with a private link to view or cancel the booking."
        />
      </fieldset>

      <div className="flex gap-4 border-b border-rule px-5 py-5 sm:px-7">
        <span className="h-fit shrink-0 rounded-sm border border-dashed border-rule-strong px-1.5 py-0.5 font-mono text-[0.625rem] leading-4 text-ink-2 uppercase">
          Demo
        </span>
        <p className="text-small text-ink-2">
          <span className="font-semibold text-ink">Payment is simulated.</span> No card is needed. A
          live hotel would take the deposit here, before the booking is confirmed.
        </p>
      </div>

      <div className="flex flex-col gap-4 px-5 pt-6 pb-6 sm:px-7">
        <HoldFrame expiresAt={expiresAt} heldAt={heldAt} now={now}>
          <Button type="submit" size="lg" isPending={pending} className="w-full">
            {pending ? 'Confirming your booking' : 'Confirm booking'}
          </Button>
        </HoldFrame>
        <HoldStatus expiresAt={expiresAt} now={now} timeZone={timeZone} />
        {generalError ? (
          <p role="alert" className="text-small text-danger">
            {generalError}
          </p>
        ) : (
          <p className="text-small text-ink-3">
            If your connection drops, press Confirm again. You will not be booked twice.
          </p>
        )}
      </div>
    </Form>
  );
}
