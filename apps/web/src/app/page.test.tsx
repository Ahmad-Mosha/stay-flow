import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axeViolations } from '@/test/axe';
import HomePage from './page';

describe('home page', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<HomePage />);

    expect(await axeViolations(container)).toEqual([]);
  });

  it('links to the design system', () => {
    render(<HomePage />);

    expect(screen.getByRole('link', { name: 'See the design system' })).toHaveAttribute(
      'href',
      '/design-system',
    );
  });
});
