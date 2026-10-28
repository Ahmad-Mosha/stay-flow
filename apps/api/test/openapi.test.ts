import { endpoints } from '@stay-flow/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Validator } from '@seriousme/openapi-schema-validator';
import type { IRoute } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApiDocument, UNDOCUMENTED_ROUTES, validatorFor } from './support/contract-check.js';
import { createTestApp } from './support/test-app.js';

/** Express keeps the methods a route answers, though its types leave them out. */
type ServedRoute = IRoute & { readonly methods: Record<string, boolean> };

describe('OpenAPI docs', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a valid OpenAPI 3.1 document', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/openapi.json')
      .expect(200)
      .expect('Content-Type', /^application\/json/);
    const served = response.body as Record<string, unknown>;

    expect(await new Validator().validate(served)).toEqual({ valid: true });
    expect(served).toEqual(JSON.parse(JSON.stringify(openApiDocument)));
  });

  it('describes every request and response with a JSON Schema that compiles', () => {
    for (const name of Object.keys(openApiDocument.components.schemas)) {
      expect(() => validatorFor({ $ref: `#/components/schemas/${name}` }), name).not.toThrow();
    }
  });

  it('documents every route the API serves, and no other', () => {
    // A controller route answers one method; middleware mounted on a path answers them all.
    const { stack } = app.getHttpAdapter().getInstance().router;
    const served = stack.flatMap(({ route }) => {
      const methods = Object.keys((route as ServedRoute | undefined)?.methods ?? {});
      return route === undefined || methods.length !== 1
        ? []
        : [`${methods.join().toUpperCase()} ${route.path.replace(/:(\w+)/g, '{$1}')}`];
    });
    const documented = Object.values(endpoints).map(
      ({ method, path }) => `${method.toUpperCase()} ${path}`,
    );

    expect(served.filter((route) => !UNDOCUMENTED_ROUTES.includes(route)).toSorted()).toEqual(
      documented.toSorted(),
    );
  });

  it('serves a reference page that reads the document', async () => {
    const { text } = await request(app.getHttpServer())
      .get('/v1/docs')
      .expect(200)
      .expect('Content-Type', 'text/html; charset=utf-8');

    expect(text).toMatch(/<script src="https:\/\/cdn\.jsdelivr\.net\/[^"]+" integrity="sha384-/);
    expect(text).toContain("url: 'openapi.json'");
  });
});
