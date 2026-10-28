import * as contracts from '@stay-flow/contracts';
import { type Endpoint, endpoints } from '@stay-flow/contracts';
import { z } from 'zod';
import { PROBLEM_CONTENT_TYPE, problemDetailsSchema } from '../errors/problem-details.js';
import { IDEMPOTENCY_KEY_PATTERN } from '../idempotency/idempotency-key.decorator.js';

export type JsonSchema = Record<string, unknown>;

export interface OpenApiParameter {
  readonly name: string;
  readonly in: 'path' | 'query' | 'header';
  readonly required: boolean;
  readonly description?: string;
  readonly schema: JsonSchema;
}

export interface OpenApiOperation {
  readonly operationId: string;
  readonly tags: readonly string[];
  readonly summary: string;
  readonly description?: string;
  readonly security: readonly Record<string, readonly string[]>[];
  readonly parameters: readonly OpenApiParameter[];
  readonly requestBody?: {
    readonly required: true;
    readonly content: Record<string, { readonly schema: JsonSchema }>;
  };
  readonly responses: Record<string, JsonSchema>;
}

/** An OpenAPI 3.1 document, typed as far as the API builds it. */
export interface OpenApiDocument {
  readonly openapi: '3.1.1';
  readonly info: { readonly title: string; readonly version: string; readonly description: string };
  readonly paths: Record<string, Partial<Record<Endpoint['method'], OpenApiOperation>>>;
  readonly components: {
    readonly schemas: Record<string, JsonSchema>;
    readonly responses: Record<string, JsonSchema>;
    readonly securitySchemes: Record<string, JsonSchema>;
  };
}

type Io = 'input' | 'output';

const DESCRIPTION = `The booking and front-desk API of Stay Flow.

**Errors** are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem documents. Switch on
their \`code\`, which never changes, rather than on the title or detail.

**Request ids**: every response carries an \`X-Request-Id\` header, also in each problem document.
Send your own, of 8 to 128 letters, digits, \`_\` or \`-\`, to find a request in the logs.

**Retries**: endpoints that take an \`Idempotency-Key\` header do their work once per key. A
retry with the same key gets the first answer, marked \`Idempotent-Replayed: true\`.`;

/** The name each schema the contracts export gets: placeHoldRequestSchema is PlaceHoldRequest. */
const componentNames = new Map<unknown, string>(
  Object.entries(contracts)
    .filter(([name]) => name.endsWith('Schema'))
    .map(([name, schema]) => [
      schema,
      name.charAt(0).toUpperCase() + name.slice(1, -'Schema'.length),
    ]),
);

function toJsonSchema(schema: z.ZodType, io: Io): JsonSchema {
  const json: JsonSchema = { ...z.toJSONSchema(schema, { io, override: describeCoercion }) };
  delete json.$schema;
  return json;
}

/**
 * Path and query values arrive as text, which z.coerce.number().pipe(guestsSchema) reads as a
 * number. Such a value is described by the schema it must then pass, an integer from 1 to 20,
 * rather than as any number.
 */
function describeCoercion({
  zodSchema,
  jsonSchema,
}: {
  zodSchema: z.core.$ZodTypes;
  jsonSchema: z.core.JSONSchema.BaseSchema;
}): void {
  const { def } = zodSchema._zod;
  if (def.type === 'pipe' && 'coerce' in def.in._zod.def && def.in._zod.def.coerce === true) {
    Object.assign(jsonSchema, toJsonSchema(def.out as z.ZodType, 'input'));
  }
}

/**
 * Builds the OpenAPI document from the endpoint list and the Zod schemas the API validates with,
 * so the two cannot drift apart. Requests are described as the API accepts them, responses as it
 * sends them: a response has no fields beyond those listed.
 */
export function buildOpenApiDocument(): OpenApiDocument {
  const schemas: Record<string, JsonSchema> = {
    ProblemDetails: toJsonSchema(problemDetailsSchema, 'output'),
  };
  const ios = new Map<string, Io>();

  const ref = (schema: z.ZodType, io: Io): JsonSchema => {
    const name = componentNames.get(schema);
    if (name === undefined) {
      throw new Error('A request or response schema must be exported by @stay-flow/contracts');
    }
    if ((ios.get(name) ?? io) !== io) {
      throw new Error(`${name} is used for both a request and a response`);
    }
    ios.set(name, io);
    schemas[name] ??= toJsonSchema(schema, io);
    return { $ref: `#/components/schemas/${name}` };
  };

  const operation = (operationId: string, endpoint: Endpoint): OpenApiOperation => ({
    operationId,
    tags: [endpoint.tag],
    summary: endpoint.summary,
    ...(endpoint.description === undefined ? {} : { description: endpoint.description }),
    security: endpoint.auth === 'public' ? [] : [{ [endpoint.auth]: [] }],
    parameters: [
      ...parameters(endpoint.params, 'path'),
      ...parameters(endpoint.query, 'query'),
      ...(endpoint.idempotent === true ? [idempotencyKey] : []),
    ],
    ...(endpoint.body === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref(endpoint.body, 'input') } },
          },
        }),
    responses: {
      [String(endpoint.status)]:
        endpoint.response === undefined
          ? { description: 'Done. No content.' }
          : {
              description: 'Done.',
              content: { 'application/json': { schema: ref(endpoint.response, 'output') } },
            },
      default: { $ref: '#/components/responses/Problem' },
    },
  });

  const paths: OpenApiDocument['paths'] = {};
  for (const [operationId, endpoint] of Object.entries(endpoints) as [string, Endpoint][]) {
    paths[endpoint.path] = {
      ...paths[endpoint.path],
      [endpoint.method]: operation(operationId, endpoint),
    };
  }

  return {
    openapi: '3.1.1',
    info: { title: 'Stay Flow API', version: '1', description: DESCRIPTION },
    paths,
    components: {
      schemas,
      responses: {
        Problem: {
          description: 'The request failed. See `code` for why.',
          content: {
            [PROBLEM_CONTENT_TYPE]: { schema: { $ref: '#/components/schemas/ProblemDetails' } },
          },
        },
      },
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'session',
          description:
            'Set by sign-up and sign-in, and named `__Host-session` over HTTPS. Requests that ' +
            'change anything must also come from the API’s own origin or a trusted one.',
        },
        guestLink: {
          type: 'http',
          scheme: 'bearer',
          description: 'The token in the manage-booking link of the confirmation email.',
        },
      },
    },
  };
}

const idempotencyKey: OpenApiParameter = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  description: 'Made by the client for each action, such as a UUID. Reuse it only to retry.',
  schema: { type: 'string', pattern: IDEMPOTENCY_KEY_PATTERN.source },
};

/** One parameter per property of a params or query schema. */
function parameters(schema: z.ZodType | undefined, location: 'path' | 'query'): OpenApiParameter[] {
  if (schema === undefined) {
    return [];
  }
  const { properties = {}, required = [] } = toJsonSchema(schema, 'input') as {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === 'path' || required.includes(name),
    schema: property,
  }));
}
