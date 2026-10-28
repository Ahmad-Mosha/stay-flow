import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import type { AppConfig } from './config/config.js';
import { APP_CONFIG } from './config/config.module.js';
import { GracefulShutdown } from './platform/health/graceful-shutdown.js';
import { requestIdMiddleware } from './platform/logging/request-id.js';

export const API_PREFIX = 'v1';

/** HTTP setup shared by main.ts and the integration tests. Call it before app.init(). */
export function configureApp(app: NestExpressApplication): void {
  app.use(app.get(GracefulShutdown).track);
  app.use(requestIdMiddleware);
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  // Lets request.ip read X-Forwarded-For, but only the entries our own proxies added.
  app.set('trust proxy', app.get<AppConfig>(APP_CONFIG).http.trustProxyHops);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health/live', 'health/ready'] });
  // On SIGTERM, GracefulShutdown lets the requests in flight finish before the database closes.
  app.enableShutdownHooks();
}
