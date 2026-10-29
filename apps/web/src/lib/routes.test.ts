import { describe, expect, it } from 'vitest';
import { returnPath, routes } from './routes';

describe('returnPath', () => {
  it('returns to a page of the dashboard', () => {
    expect(returnPath('/host/dar-nubia/today')).toBe('/host/dar-nubia/today');
    expect(returnPath('/host')).toBe('/host');
  });

  it('never leaves for another site or a page outside the dashboard', () => {
    for (const next of ['//evil.example/host', 'https://evil.example', '/hostile', '/', null]) {
      expect(returnPath(next)).toBe('/host');
    }
  });
});

describe('routes.signIn', () => {
  it('carries the page to return to', () => {
    expect(routes.signIn('/host/dar-nubia/today?x=1')).toBe(
      '/sign-in?next=%2Fhost%2Fdar-nubia%2Ftoday%3Fx%3D1',
    );
  });
});
