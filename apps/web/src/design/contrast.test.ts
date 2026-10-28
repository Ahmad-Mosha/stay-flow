// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('contrast', () => {
  it('gives black on white 21:1 and a colour on itself 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#2338c4', '#2338c4')).toBe(1);
  });

  it('matches the WCAG reference value for #767676 on white', () => {
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('does not depend on argument order', () => {
    expect(contrastRatio('#15171c', '#f2f0ea')).toBe(contrastRatio('#f2f0ea', '#15171c'));
  });

  it('rejects anything but #rrggbb', () => {
    expect(() => relativeLuminance('#fff')).toThrow('Expected a #rrggbb colour');
  });
});
