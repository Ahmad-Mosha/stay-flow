import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { host } from '@/test/fixtures';
import { SignUpForm } from './sign-up-form';

const api = vi.fn();
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: (...args: unknown[]): unknown => api(...args),
}));
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function renderForm() {
  return render(
    <Providers>
      <SignUpForm />
    </Providers>,
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>, email = 'laila@example.com') {
  await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Laila Mansour');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), email);
  await user.type(screen.getByLabelText('Password'), 'river view rooms by the nile');
}

beforeEach(() => {
  api.mockReset();
  vi.clearAllMocks();
});

describe('SignUpForm', () => {
  it('says what is missing after a first press, and sends nothing', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByText('Use at least 15 characters')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveFocus();
    expect(api).not.toHaveBeenCalled();
  });

  it('counts down to a long enough password', async () => {
    const user = userEvent.setup();
    renderForm();

    const password = screen.getByLabelText('Password');
    expect(screen.getByText(/At least 15 characters/)).toBeInTheDocument();
    await user.type(password, 'nile view');
    expect(screen.getByText('6 more characters to go.')).toBeInTheDocument();
    await user.type(password, ' rooms');
    expect(screen.getByText('Long enough.')).toBeInTheDocument();
  });

  it('creates the account, then goes on to set up a property', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(host);
    renderForm();

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(api).toHaveBeenCalledWith('signUp', {
      body: {
        name: 'Laila Mansour',
        email: 'laila@example.com',
        password: 'river view rooms by the nile',
      },
    });
    expect(router.replace).toHaveBeenCalledWith('/host/new');
  });

  it('offers to sign in when the email has an account, until the email changes', async () => {
    const user = userEvent.setup();
    api.mockRejectedValue(
      new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.'),
    );
    renderForm();

    await fill(user, 'host@example.com');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('An account already uses this email.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute(
      'href',
      '/sign-in',
    );
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'x');
    expect(screen.queryByText('An account already uses this email.')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderForm();

    expect(await axeViolations(container)).toEqual([]);
  });
});
