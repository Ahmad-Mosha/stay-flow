import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { requestIdMiddleware } from './platform/logging/request-id.js';

export const API_PREFIX = 'v1';

/**
 * HTTP-level setup shared by main.ts and the integration tests, so tests exercise the
 * same prefix, logger and shutdown behaviour as production. Must run before app.init().
 */
export function configureApp(app: NestExpressApplication): void {
  // Added before init(), so it runs ahead of the body parser that Nest registers during init().
  app.use(requestIdMiddleware);
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  // Health probes stay unversioned: load balancers and orchestrators address them directly.
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health/live', 'health/ready'] });
  // Runs onApplicationShutdown hooks (closing the database pool) on SIGTERM and SIGINT.
  app.enableShutdownHooks();
}
