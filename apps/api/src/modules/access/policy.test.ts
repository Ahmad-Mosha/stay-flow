import { describe, expect, it } from 'vitest';
import { can } from './policy.js';

describe('can', () => {
  it('lets every role see the property and its team', () => {
    for (const role of ['owner', 'manager', 'front_desk'] as const) {
      expect(can(role, 'property.view')).toBe(true);
      expect(can(role, 'team.view')).toBe(true);
    }
  });

  it('lets owners and managers run the property, but not the front desk', () => {
    for (const permission of ['property.manage', 'inventory.manage'] as const) {
      expect(can('owner', permission)).toBe(true);
      expect(can('manager', permission)).toBe(true);
      expect(can('front_desk', permission)).toBe(false);
    }
  });

  it('lets every role block a room and run the stays', () => {
    for (const role of ['owner', 'manager', 'front_desk'] as const) {
      expect(can(role, 'blocks.manage')).toBe(true);
      expect(can(role, 'reservations.manage')).toBe(true);
    }
  });

  it('leaves the team to owners', () => {
    expect(can('owner', 'team.manage')).toBe(true);
    expect(can('manager', 'team.manage')).toBe(false);
    expect(can('front_desk', 'team.manage')).toBe(false);
  });
});
