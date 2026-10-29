'use client';

import { signInRequestSchema, type SignInRequest } from '@stay-flow/contracts';
import { useMutation } from '@tanstack/react-query';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button as AriaButton, Form } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { demoHost } from '@/lib/demo';
import { Button } from '@/ui/button';
import { EyeIcon, EyeOffIcon } from '@/ui/icons';
import { TextField } from '@/ui/text-field';

type Field = keyof SignInRequest;

const fieldCopy: Record<Field, string> = {
  email: 'Enter your email address, like name@example.com',
  password: 'Enter your password',
};

function checkField(field: Field, value: string): string | null {
  return signInRequestSchema.shape[field].safeParse(value).success ? null : fieldCopy[field];
}

function errorCopy(error: unknown): string {
  if (isApiError(error, 'INVALID_CREDENTIALS')) {
    return 'That email and password do not match an account. Check both and try again.';
  }
  if (isApiError(error, 'RATE_LIMITED')) {
    return 'Too many attempts in a short time. Wait a minute, then try again.';
  }
  return 'We could not reach the server. Check your connection and try again.';
}

/** Email and password, plus a one-press way in to the demo hotel. */
export function SignInForm({ next }: { next: Route }) {
  const router = useRouter();
  const [attempted, setAttempted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const signIn = useMutation({
    mutationFn: (body: SignInRequest) => api('signIn', { body }),
    onSuccess: () => {
      router.replace(next);
      router.refresh();
    },
  });
  // Stays busy after success too, while the dashboard loads.
  const busy = signIn.isPending || signIn.isSuccess;
  const validate = (field: Field) => (value: string) =>
    attempted ? checkField(field, field === 'email' ? value.trim() : value) : null;

  return (
    <div className="flex flex-col gap-8">
      <Form
        aria-label="Sign in"
        validationBehavior="aria"
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          const form = event.currentTarget;
          const data = new FormData(form);
          const text = (name: Field) => {
            const value = data.get(name);
            return typeof value === 'string' ? value : '';
          };
          const body = { email: text('email').trim(), password: text('password') };
          const invalid = (Object.keys(body) as Field[]).find((field) =>
            checkField(field, body[field]),
          );
          if (invalid) {
            form.querySelector<HTMLInputElement>(`input[name="${invalid}"]`)?.focus();
            return;
          }
          signIn.mutate(body);
        }}
        className="flex flex-col gap-5"
      >
        <TextField
          name="email"
          type="email"
          label="Email"
          autoComplete="username"
          isRequired
          isDisabled={busy}
          validate={validate('email')}
        />
        <TextField
          name="password"
          type={showPassword ? 'text' : 'password'}
          label="Password"
          autoComplete="current-password"
          isRequired
          isDisabled={busy}
          validate={validate('password')}
          trailing={
            <AriaButton
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onPress={() => {
                setShowPassword((shown) => !shown);
              }}
              className="flex size-10 cursor-pointer items-center justify-center rounded-sm text-ink-2 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </AriaButton>
          }
        />
        {signIn.isError && (
          <p role="alert" className="text-small text-danger">
            {errorCopy(signIn.error)}
          </p>
        )}
        <Button type="submit" size="lg" isPending={busy} className="mt-1 w-full">
          {busy ? 'Signing in' : 'Sign in'}
        </Button>
      </Form>

      <div className="flex flex-col gap-4 rounded-lg border border-dashed border-rule-strong p-5">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-label tracking-[0.06em] text-ink-2 uppercase">
            Demo front desk
          </p>
          <p className="text-small text-ink-2">
            Dar Nubia Guesthouse, with made-up guests. Check people in, block rooms, change prices.
          </p>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-small">
          <dt className="text-ink-3">Email</dt>
          <dd className="truncate text-ink">{demoHost.email}</dd>
          <dt className="text-ink-3">Password</dt>
          <dd className="truncate text-ink">{demoHost.password}</dd>
        </dl>
        <Button
          variant="secondary"
          isDisabled={busy}
          onPress={() => {
            signIn.mutate(demoHost);
          }}
        >
          Sign in as the demo host
        </Button>
      </div>
    </div>
  );
}
