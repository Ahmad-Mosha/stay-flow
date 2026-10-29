import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { axeViolations } from '@/test/axe';
import { host, hostProperty } from '@/test/fixtures';
import { HostShell } from './host-shell';
import { ThemeRoot } from './theme';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/host/dar-nubia/today',
}));

const properties = [
  { id: hostProperty.id, slug: 'dar-nubia', name: 'Dar Nubia Guesthouse', role: 'owner' as const },
  {
    id: '01a1825d-fad0-7292-82eb-c902afb044e7',
    slug: 'nile-loft',
    name: 'Nile Loft',
    role: 'front_desk' as const,
  },
];

function renderShell() {
  return render(
    <Providers>
      <ThemeRoot initial="light">
        <HostShell user={host} properties={properties} property={hostProperty}>
          <h1>Today</h1>
          <input aria-label="Notes" />
        </HostShell>
      </ThemeRoot>
    </Providers>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.cookie = 'stay-flow-theme=; max-age=0; path=/';
});

describe('HostShell', () => {
  it('marks the section that is open', () => {
    renderShell();

    const nav = within(screen.getByRole('navigation', { name: 'Dashboard' }));
    expect(nav.getByRole('link', { name: /Today/ })).toHaveAttribute('aria-current', 'page');
  });

  it('opens a section with G and then its letter, but not while typing', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('textbox', { name: 'Notes' }));
    await user.keyboard('gt');
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'g' });
    fireEvent.keyDown(document.body, { key: 't' });
    expect(router.push).toHaveBeenCalledWith('/host/dar-nubia/today');
  });

  it('switches to another property in the same section', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: /Switch property/ }));
    await user.click(screen.getByRole('menuitemradio', { name: /Nile Loft/ }));

    expect(router.push).toHaveBeenCalledWith('/host/nile-loft/today');
  });

  it('remembers the dark theme for the next visit', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.cookie).toContain('stay-flow-theme=dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderShell();

    expect(await axeViolations(container)).toEqual([]);
  });
});
