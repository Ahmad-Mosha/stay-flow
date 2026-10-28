import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextLink } from '@/ui/link';
import { Providers } from './providers';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('Providers', () => {
  it('navigates with the Next.js router instead of a full page load', async () => {
    render(
      <Providers>
        <TextLink href="/design-system">Design system</TextLink>
      </Providers>,
    );

    await userEvent.click(screen.getByRole('link', { name: 'Design system' }));

    expect(push).toHaveBeenCalledWith('/design-system', undefined);
  });
});
