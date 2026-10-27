import { describe, expect, it } from 'vitest';
import { isUntrustedCrossOrigin, type RequestSource } from './cross-origin.js';

const trusted = new Set(['https://app.stayflow.example']);

function check(request: Partial<RequestSource>): boolean {
  return isUntrustedCrossOrigin(
    {
      method: 'POST',
      host: 'api.stayflow.example',
      origin: undefined,
      secFetchSite: undefined,
      ...request,
    },
    trusted,
  );
}

describe('isUntrustedCrossOrigin', () => {
  it('allows safe methods from anywhere', () => {
    expect(check({ method: 'GET', secFetchSite: 'cross-site' })).toBe(false);
  });

  it('blocks a cross-site request from a modern browser', () => {
    expect(check({ secFetchSite: 'cross-site', origin: 'https://evil.example' })).toBe(true);
    expect(check({ secFetchSite: 'same-site', origin: 'https://blog.stayflow.example' })).toBe(
      true,
    );
  });

  it('allows same-origin requests and ones the user typed or bookmarked', () => {
    expect(check({ secFetchSite: 'same-origin' })).toBe(false);
    expect(check({ secFetchSite: 'none' })).toBe(false);
  });

  it('allows a trusted origin, even from another site', () => {
    expect(check({ secFetchSite: 'same-site', origin: 'https://app.stayflow.example' })).toBe(
      false,
    );
  });

  it('compares Origin with Host when the browser sends no Sec-Fetch-Site', () => {
    expect(check({ origin: 'https://api.stayflow.example' })).toBe(false);
    expect(check({ origin: 'https://evil.example' })).toBe(true);
    expect(check({ origin: 'null' })).toBe(true);
  });

  it('allows requests that come from outside a browser', () => {
    expect(check({})).toBe(false);
  });
});
