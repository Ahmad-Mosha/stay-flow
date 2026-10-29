'use client';

import type { StayRules } from '@stay-flow/contracts';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Form } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { zoneLabel } from '@/lib/format';
import { routes } from '@/lib/routes';
import { Button } from '@/ui/button';
import { LinkIcon } from '@/ui/icons';
import { TextLink } from '@/ui/link';
import { Notice, type NoticeMessage } from '@/ui/notice';
import { NumberField } from '@/ui/number-field';
import { Skeleton } from '@/ui/skeleton';
import { TextField } from '@/ui/text-field';
import { TimeField } from '@/ui/time-field';
import { useHost } from '../host-context';
import { canManage } from '../permissions';
import {
  changesOf,
  draftOf,
  problemsOf,
  stayRulesSummary,
  type SettingsDraft,
} from './settings-draft';

/** The property's name, arrival times and stay rules, saved together. */
export function SettingsView() {
  const { property } = useHost();
  const router = useRouter();
  const editable = canManage(property.role, 'property');
  const [saved, setSaved] = useState(() => draftOf(property));
  const [draft, setDraft] = useState(saved);
  const [attempted, setAttempted] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const changes = changesOf(saved, draft);
  const problems = problemsOf(draft);
  const shown = attempted ? problems : {};

  const save = useMutation({
    mutationFn: () => {
      if (!changes) throw new Error('Nothing to save');
      return api('updateProperty', { params: { propertyId: property.id }, body: changes });
    },
    onSuccess: (updated) => {
      const next = draftOf(updated);
      setSaved(next);
      setDraft(next);
      setAttempted(false);
      setNotice({ text: 'Settings saved. New bookings follow them from now on.', tone: 'done' });
      // The name also shows in the sidebar, which the server renders.
      router.refresh();
    },
  });

  const edit = (change: (current: SettingsDraft) => SettingsDraft) => {
    setDraft(change);
    save.reset();
    // The save bar takes the notice's place at the bottom of the screen.
    setNotice(null);
  };
  const setRule = (key: keyof StayRules) => (value: number) => {
    edit((current) => ({ ...current, stayRules: { ...current.stayRules, [key]: value } }));
  };
  const set =
    <K extends keyof SettingsDraft>(key: K) =>
    (value: SettingsDraft[K]) => {
      edit((current) => ({ ...current, [key]: value }));
    };
  const invalid = attempted && Object.keys(problems).length > 0;
  const common = { isReadOnly: !editable, isDisabled: save.isPending };

  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex max-w-5xl flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-label tracking-[0.04em] text-ink-3 uppercase">
            {property.name} · {property.timeZone} · {property.currency}
          </p>
          <h1 className="font-display text-[2.5rem] leading-none font-normal tracking-[-0.02em]">
            Settings
          </h1>
        </div>
        {!editable && (
          <p className="text-small text-ink-3">Only owners and managers can change settings.</p>
        )}
      </header>

      <Form
        validationBehavior="aria"
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          if (!changes || Object.keys(problems).length > 0 || save.isPending) return;
          save.mutate();
        }}
        className="flex max-w-5xl flex-col gap-10"
      >
        <Section
          id="property"
          title="Property"
          intro="The name guests see on the booking page, in emails and on their receipts."
        >
          <TextField
            label="Name"
            value={draft.name}
            onChange={set('name')}
            maxLength={120}
            isRequired
            isInvalid={Boolean(shown.name)}
            errorMessage={shown.name}
            {...common}
          />
          <dl className="grid gap-x-5 gap-y-4 rounded-md border border-rule px-4 py-3.5 text-small sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)]">
            <Fact label="Booking page">
              <TextLink
                href={routes.property(property.slug)}
                className="inline-flex items-center gap-1.5"
              >
                <LinkIcon className="size-3.5" />
                /stay/{property.slug}
              </TextLink>
            </Fact>
            <Fact label="Time zone">{zoneLabel(property.timeZone)}</Fact>
            <Fact label="Currency">{property.currency}</Fact>
          </dl>
          <p className="text-small text-ink-3">
            The time zone and currency stay as they are: every date and price depends on them.
          </p>
        </Section>

        <Section
          id="arrival"
          title="Arrival and departure"
          intro={`On the booking page and in every confirmation, in ${zoneLabel(property.timeZone)}.`}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <TimeField
              label="Check-in from"
              value={draft.checkInTime}
              onChange={set('checkInTime')}
              {...common}
            />
            <TimeField
              label="Check-out by"
              value={draft.checkOutTime}
              onChange={set('checkOutTime')}
              {...common}
            />
          </div>
        </Section>

        <Section
          id="stay-rules"
          title="Stay rules"
          intro="What guests can book. Bookings already made keep the rules they were made under."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField
              label="Shortest stay"
              suffix="nights"
              value={draft.stayRules.minNights}
              onChange={setRule('minNights')}
              minValue={1}
              maxValue={365}
              isInvalid={Boolean(shown.minNights)}
              errorMessage={shown.minNights}
              {...common}
            />
            <NumberField
              label="Longest stay"
              suffix="nights"
              value={draft.stayRules.maxNights}
              onChange={setRule('maxNights')}
              minValue={1}
              maxValue={365}
              isInvalid={Boolean(shown.maxNights)}
              errorMessage={shown.maxNights}
              {...common}
            />
            <NumberField
              label="Book ahead up to"
              suffix="days"
              value={draft.stayRules.bookingWindowDays}
              onChange={setRule('bookingWindowDays')}
              minValue={1}
              maxValue={730}
              isInvalid={Boolean(shown.bookingWindowDays)}
              errorMessage={shown.bookingWindowDays}
              {...common}
            />
            <NumberField
              label="Free cancellation until"
              description="Hours before check-in. After that, the first night is not refunded."
              suffix="hours"
              value={draft.stayRules.freeCancellationHours}
              onChange={setRule('freeCancellationHours')}
              minValue={0}
              maxValue={720}
              isInvalid={Boolean(shown.freeCancellationHours)}
              errorMessage={shown.freeCancellationHours}
              {...common}
            />
          </div>
          {!problems.minNights && !problems.maxNights && (
            <figure className="flex flex-col gap-2 rounded-md border border-dashed border-rule-strong bg-paper px-4 py-3.5">
              <figcaption className="font-mono text-[0.6875rem] text-ink-3 uppercase">
                What guests read
              </figcaption>
              {stayRulesSummary(draft.stayRules).map((line) => (
                <p key={line} className="text-small text-ink-2">
                  {line}
                </p>
              ))}
            </figure>
          )}
        </Section>

        {editable && (changes !== null || save.isError) && (
          <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-rule bg-raised px-5 py-3.5 shadow-overlay">
            <p role="status" className="text-small text-ink-2">
              {save.isError
                ? isApiError(save.error, 'STAY_RULES_CONFLICT')
                  ? 'The longest stay cannot be shorter than the shortest. Nothing was saved.'
                  : 'We could not save the settings. Nothing has changed. Try again in a moment.'
                : invalid
                  ? 'Fix the marked fields to save.'
                  : 'You have unsaved changes.'}
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                isDisabled={save.isPending}
                onPress={() => {
                  setDraft(saved);
                  setAttempted(false);
                  save.reset();
                }}
              >
                Discard
              </Button>
              <Button type="submit" isPending={save.isPending} isDisabled={!changes}>
                {save.isPending ? 'Saving' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </Form>

      <Notice
        message={notice}
        onDismiss={() => {
          setNotice(null);
        }}
      />
    </div>
  );
}

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid gap-x-10 gap-y-4 border-t border-rule pt-6 lg:grid-cols-[16rem_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id={`${id}-title`} className="font-display text-headline font-normal">
          {title}
        </h2>
        <p className="text-small text-ink-2">{intro}</p>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="font-mono text-[0.6875rem] text-ink-3 uppercase">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading settings"
      className="flex flex-col gap-8 px-4 py-6 sm:px-8 lg:px-10 lg:py-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-10 w-44" />
      </div>
      <Skeleton className="h-56 max-w-5xl rounded-lg" />
      <Skeleton className="h-40 max-w-5xl rounded-lg" />
    </div>
  );
}
