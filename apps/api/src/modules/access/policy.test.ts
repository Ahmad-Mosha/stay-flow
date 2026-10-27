import { describe, expect, it } from 'vitest';
import { can } from './policy.js';

describe('can', () => {
  it('lets every role see the property and its team', () => {
    for (const role of ['owner', 'manager', 'front_desk'] as const) {
      expect(can(role, 'property.view')).toBe(true);
      expect(can(role, 'team.view')).toBe(true);
    }
  });

  it('leaves the team to owners', () => {
    expect(can('owner', 'team.manage')).toBe(true);
    expect(can('manager', 'team.manage')).toBe(false);
    expect(can('front_desk', 'team.manage')).toBe(false);
  });
});
