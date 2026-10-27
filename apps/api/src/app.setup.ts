import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { requestIdMiddleware } from './platform/logging/request-id.js';

export const API_PREFIX = 'v1';

/** HTTP setup shared by main.ts and the integration tests. Call it before app.init(). */
export function configureApp(app: NestExpressApplication): void {
  app.use(requestIdMiddleware);
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health/live', 'health/ready'] });
  app.enableShutdownHooks();
}
