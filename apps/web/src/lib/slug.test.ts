import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('makes a web address from a name', () => {
    expect(slugify('Nile View Double')).toBe('nile-view-double');
    expect(slugify('  Café — Rooftop  Studio! ')).toBe('cafe-rooftop-studio');
    expect(slugify('***')).toBe('');
  });

  it('keeps addresses within 64 characters without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(63)} b`);
    expect(slug).toBe('a'.repeat(63));
  });
});
