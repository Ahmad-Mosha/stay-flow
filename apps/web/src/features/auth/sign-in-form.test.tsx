import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { Providers } from '@/app/providers';
import { demoHost } from '@/lib/demo';
import { routes } from '@/lib/routes';
import { axeViolations } from '@/test/axe';
import { host } from '@/test/fixtures';
import { SignInForm } from './sign-in-form';

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
      <SignInForm next={routes.today('dar-nubia')} />
    </Providers>,
  );
}

beforeEach(() => {
  api.mockReset();
  vi.clearAllMocks();
});

describe('SignInForm', () => {
  it('says what is missing only after a first press, and sends nothing', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByText(/Enter your/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter your email address, like name@example.com')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus();
    expect(api).not.toHaveBeenCalled();
  });

  it('signs in and returns to the page that asked for it', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(host);
    renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Email' }), ' host@example.com ');
    await user.type(screen.getByLabelText('Password'), 'a password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(api).toHaveBeenCalledWith('signIn', {
      body: { email: 'host@example.com', password: 'a password' },
    });
    expect(router.replace).toHaveBeenCalledWith('/host/dar-nubia/today');
  });

  it('explains wrong credentials without saying which one was wrong', async () => {
    const user = userEvent.setup();
    api.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.'));
    renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'host@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password do not match an account.',
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows the password on request', async () => {
    const user = userEvent.setup();
    renderForm();
    const password = screen.getByLabelText('Password');

    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('signs in to the demo hotel in one press', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(host);
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Sign in as the demo host' }));

    expect(api).toHaveBeenCalledWith('signIn', { body: demoHost });
  });

  it('signs in as the rest of the demo team too', async () => {
    const user = userEvent.setup();
    api.mockResolvedValue(host);
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Front desk' }));

    expect(api).toHaveBeenCalledWith('signIn', {
      body: { email: 'frontdesk@example.com', password: demoHost.password },
    });
  });

  it('points a new host to sign up', () => {
    renderForm();

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = renderForm();

    expect(await axeViolations(container)).toEqual([]);
  });
});
