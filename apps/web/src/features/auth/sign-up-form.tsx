'use client';

import { signUpRequestSchema, type SignUpRequest } from '@stay-flow/contracts';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Form } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { routes } from '@/lib/routes';
import { Button } from '@/ui/button';
import { TextLink } from '@/ui/link';
import { TextField } from '@/ui/text-field';
import { PasswordField } from './password-field';

type Field = keyof SignUpRequest;

/** NIST asks for at least 15 characters when a password is the only factor; the API holds to it. */
const PASSWORD_MIN = 15;

const fieldCopy: Record<Field, string> = {
  name: 'Enter your name',
  email: 'Enter your email address, like name@example.com',
  password: `Use at least ${String(PASSWORD_MIN)} characters`,
};

function checkField(field: Field, value: string): string | null {
  return signUpRequestSchema.shape[field].safeParse(value).success ? null : fieldCopy[field];
}

/** How far the password is from long enough, as the host types it. */
function passwordHelp(password: string): string {
  const missing = PASSWORD_MIN - password.length;
  if (password.length === 0) {
    return `At least ${String(PASSWORD_MIN)} characters. A short sentence you will remember works well.`;
  }
  return missing > 0
    ? `${String(missing)} more ${missing === 1 ? 'character' : 'characters'} to go.`
    : 'Long enough.';
}

/** Name, email and a long password. Signs the new host in and takes them to set up a property. */
export function SignUpForm() {
  const router = useRouter();
  const [values, setValues] = useState<SignUpRequest>({ name: '', email: '', password: '' });
  const [attempted, setAttempted] = useState(false);

  const signUp = useMutation({
    mutationFn: (body: SignUpRequest) => api('signUp', { body }),
    onSuccess: () => {
      router.replace(routes.newProperty());
      router.refresh();
    },
  });
  // Stays busy after success too, while the next page loads.
  const busy = signUp.isPending || signUp.isSuccess;
  const emailTaken = isApiError(signUp.error, 'EMAIL_TAKEN');

  const body: SignUpRequest = { ...values, name: values.name.trim(), email: values.email.trim() };
  const problem = (field: Field) => (attempted ? checkField(field, body[field]) : null);
  const set = (field: Field) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    // An error about the email names what was typed, so it goes once the email changes.
    if (field === 'email') signUp.reset();
  };

  return (
    <Form
      aria-label="Create your account"
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        const invalid = (Object.keys(body) as Field[]).find((field) =>
          checkField(field, body[field]),
        );
        if (invalid) {
          event.currentTarget.querySelector<HTMLInputElement>(`input[name="${invalid}"]`)?.focus();
          return;
        }
        signUp.mutate(body);
      }}
      className="flex flex-col gap-5"
    >
      <TextField
        name="name"
        label="Your name"
        autoComplete="name"
        value={values.name}
        onChange={set('name')}
        maxLength={120}
        isRequired
        isDisabled={busy}
        isInvalid={Boolean(problem('name'))}
        errorMessage={problem('name') ?? undefined}
      />
      <TextField
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        value={values.email}
        onChange={set('email')}
        isRequired
        isDisabled={busy}
        isInvalid={Boolean(problem('email')) || emailTaken}
        errorMessage={
          problem('email') ?? (emailTaken ? 'An account already uses this email.' : undefined)
        }
      />
      <PasswordField
        name="password"
        autoComplete="new-password"
        description={passwordHelp(values.password)}
        value={values.password}
        onChange={set('password')}
        maxLength={128}
        isRequired
        isDisabled={busy}
        isInvalid={Boolean(problem('password'))}
        errorMessage={problem('password') ?? undefined}
      />
      {emailTaken && (
        <p role="alert" className="text-small text-ink-2">
          Is it yours? <TextLink href={routes.signIn()}>Sign in instead</TextLink>.
        </p>
      )}
      {signUp.isError && !emailTaken && (
        <p role="alert" className="text-small text-danger">
          {isApiError(signUp.error, 'RATE_LIMITED')
            ? 'Too many attempts in a short time. Wait a minute, then try again.'
            : 'We could not reach the server. Check your connection and try again.'}
        </p>
      )}
      <Button type="submit" size="lg" isPending={busy} className="mt-1 w-full">
        {busy ? 'Creating your account' : 'Create account'}
      </Button>
      <p className="text-center text-small text-ink-2">
        Already have an account? <TextLink href={routes.signIn()}>Sign in</TextLink>
      </p>
    </Form>
  );
}
