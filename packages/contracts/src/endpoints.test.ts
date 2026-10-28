import { describe, expect, it } from 'vitest';
import { type Endpoint, endpoints } from './endpoints.js';

const list: [string, Endpoint][] = Object.entries(endpoints);

describe('endpoints', () => {
  it('names each path parameter in its params schema, and nothing else', () => {
    for (const [name, endpoint] of list) {
      const inPath = [...endpoint.path.matchAll(/\{(\w+)\}/g)].map(([, param]) => param);
      const inSchema = Object.keys(endpoint.params?.shape ?? {});

      expect(inSchema.toSorted(), name).toEqual(inPath.toSorted());
    }
  });

  it('lists each method and path once', () => {
    const routes = list.map(([, { method, path }]) => `${method} ${path}`);

    expect(new Set(routes).size).toBe(routes.length);
  });

  it('gives a body to every success but 204', () => {
    for (const [name, { status, response }] of list) {
      expect(response === undefined, name).toBe(status === 204);
    }
  });
});
