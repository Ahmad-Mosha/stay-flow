import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axeViolations } from '@/test/axe';
import DesignSystemPage from './page';

describe('design system page', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<DesignSystemPage />);

    expect(await axeViolations(container)).toEqual([]);
  });

  it('has one page heading and a heading for each section', () => {
    render(<DesignSystemPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Colour', 'Type', 'Controls', 'Status tape', 'States']);
  });
});
