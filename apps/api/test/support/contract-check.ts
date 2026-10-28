import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { NextFunction, Request, Response } from 'express';
import { PROBLEM_CONTENT_TYPE } from '../../src/platform/errors/problem-details.js';
import {
  buildOpenApiDocument,
  type JsonSchema,
  type OpenApiOperation,
  type OpenApiParameter,
} from '../../src/platform/openapi/openapi-document.js';

/** The routes that serve the docs, which the docs leave out. */
export const UNDOCUMENTED_ROUTES: readonly string[] = ['GET /v1/openapi.json', 'GET /v1/docs'];

export const openApiDocument = buildOpenApiDocument();

const ajv = addFormats.default(new Ajv2020({ allErrors: true }));
// Path, query and header values arrive as text, such as "2" for a number of guests.
const textAjv = addFormats.default(new Ajv2020({ allErrors: true, coerceTypes: true }));

/** Compiles a schema of the document, following a $ref to its component. Ajv caches each one. */
export function validatorFor(schema: JsonSchema, compiler: Ajv2020 = ajv): ValidateFunction {
  const ref = schema.$ref;
  if (typeof ref !== 'string') {
    return compiler.compile(schema);
  }
  const component = openApiDocument.components.schemas[ref.replace('#/components/schemas/', '')];
  if (component === undefined) {
    throw new Error(`The document has no schema at ${ref}`);
  }
  return compiler.compile(component);
}

type Location = OpenApiParameter['in'];

const parameterSchemas = new Map<OpenApiOperation, Record<Location, JsonSchema>>();

/** An operation's parameters as one object schema per location, to check what a request sent. */
function parameterSchemasOf(operation: OpenApiOperation): Record<Location, JsonSchema> {
  const at = (location: Location): JsonSchema => {
    // Node gives header names in lower case, as HTTP treats them alike in any case.
    const parameters = operation.parameters
      .filter((parameter) => parameter.in === location)
      .map((parameter) =>
        location === 'header' ? { ...parameter, name: parameter.name.toLowerCase() } : parameter,
      );
    return {
      type: 'object',
      properties: Object.fromEntries(parameters.map(({ name, schema }) => [name, schema])),
      required: parameters.filter(({ required }) => required).map(({ name }) => name),
    };
  };
  let schemas = parameterSchemas.get(operation);
  if (schemas === undefined) {
    schemas = { path: at('path'), query: at('query'), header: at('header') };
    parameterSchemas.set(operation, schemas);
  }
  return schemas;
}

const violations: string[] = [];

/** How the responses so far broke the document. Taking them clears the list. */
export function takeContractViolations(): string[] {
  return violations.splice(0);
}

/**
 * Holds every response to the published OpenAPI document: a success has the documented status
 * and body, and answers a request the document allows; a failure is a problem document.
 */
export function contractCheck(request: Request, response: Response, next: NextFunction): void {
  let body: unknown;
  const send = response.send.bind(response);
  // res.json sends through res.send, so this sees every body the API writes.
  response.send = (sent?: unknown) => {
    body = sent;
    return send(sent);
  };
  response.on('finish', () => {
    const target = `${request.method} ${request.originalUrl.split('?', 1)[0] ?? ''}`;
    for (const failure of check(request, response, body)) {
      violations.push(`${target} answered ${String(response.statusCode)}: ${failure}`);
    }
  });
  next();
}

function check(request: Request, response: Response, body: unknown): string[] {
  const mediaType = response.get('Content-Type')?.split(';', 1)[0];
  if (response.statusCode >= 400) {
    return mediaType === PROBLEM_CONTENT_TYPE
      ? errorsOf(validatorFor({ $ref: '#/components/schemas/ProblemDetails' }), parse(body))
      : [`a failure must be ${PROBLEM_CONTENT_TYPE}, not ${String(mediaType)}`];
  }

  // Express names a path parameter :id, OpenAPI names it {id}.
  const path = (request.route as { path: string } | undefined)?.path.replace(/:(\w+)/g, '{$1}');
  if (path !== undefined && UNDOCUMENTED_ROUTES.includes(`${request.method} ${path}`)) {
    return [];
  }
  const method = request.method.toLowerCase() as OpenApiMethod;
  const operation = path === undefined ? undefined : openApiDocument.paths[path]?.[method];
  if (operation === undefined) {
    return ['the document has no such operation'];
  }
  const success = operation.responses[String(response.statusCode)];
  if (success === undefined) {
    const documented = Object.keys(operation.responses).filter((status) => status !== 'default');
    return [`the document says ${documented.join(' or ')}`];
  }

  const content = (success.content as Record<string, { schema: JsonSchema }> | undefined)?.[
    'application/json'
  ];
  const failures: string[] = [];
  if (content === undefined) {
    if (body !== undefined && body !== '') {
      failures.push('the document says there is no body');
    }
  } else if (mediaType === 'application/json') {
    failures.push(...errorsOf(validatorFor(content.schema), parse(body)));
  } else {
    failures.push(`the body must be application/json, not ${String(mediaType)}`);
  }

  // The API took the request, so the document must allow it too. Copies, as Ajv coerces in place.
  const parameters = parameterSchemasOf(operation);
  failures.push(
    ...errorsOf(validatorFor(parameters.path, textAjv), { ...request.params }, 'path'),
    ...errorsOf(validatorFor(parameters.query, textAjv), { ...request.query }, 'query'),
    ...errorsOf(validatorFor(parameters.header, textAjv), { ...request.headers }, 'headers'),
  );
  const requestBody = operation.requestBody?.content['application/json'];
  if (requestBody !== undefined) {
    failures.push(...errorsOf(validatorFor(requestBody.schema), request.body, 'request body'));
  }
  return failures;
}

type OpenApiMethod = keyof (typeof openApiDocument.paths)[string];

function parse(body: unknown): unknown {
  return typeof body === 'string' || Buffer.isBuffer(body) ? JSON.parse(String(body)) : body;
}

function errorsOf(validate: ValidateFunction, value: unknown, part = 'body'): string[] {
  return validate(value)
    ? []
    : (validate.errors ?? []).map(({ instancePath, message, params }) => {
        const extra = (params as { additionalProperty?: string }).additionalProperty;
        return `${part}${instancePath} ${String(message)}${extra === undefined ? '' : `: ${extra}`}`;
      });
}
