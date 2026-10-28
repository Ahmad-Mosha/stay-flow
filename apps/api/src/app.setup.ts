import { NotFoundException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import type { AppConfig } from './config/config.js';
import { APP_CONFIG } from './config/config.module.js';
import { GracefulShutdown } from './platform/health/graceful-shutdown.js';
import { requestIdMiddleware } from './platform/logging/request-id.js';
import { httpMetricsMiddleware } from './platform/metrics/http-metrics.js';
import { Metrics } from './platform/metrics/metrics.js';

export const API_PREFIX = 'v1';

// Load balancers probe these paths, which stay outside the versioned API.
const PROBES = ['health/live', 'health/ready'];

/** HTTP setup shared by main.ts and the integration tests. Call it before app.init(). */
export function configureApp(app: NestExpressApplication): void {
  app.use(app.get(GracefulShutdown).track);
  app.use(httpMetricsMiddleware(app.get(Metrics)));
  app.use(requestIdMiddleware);
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  // Lets request.ip read X-Forwarded-For, but only the entries our own proxies added.
  app.set('trust proxy', app.get<AppConfig>(APP_CONFIG).http.trustProxyHops);
  app.setGlobalPrefix(API_PREFIX, { exclude: PROBES });
  app.use(notFoundOutsideApi);
  // On SIGTERM, GracefulShutdown lets the requests in flight finish before the database closes.
  app.enableShutdownHooks();
}

/**
 * Nest answers an unknown path under /v1 with a problem document, but leaves any other path to
 * Express, which answers in HTML. This gives those the same 404 problem document.
 */
function notFoundOutsideApi(request: Request, _response: Response, next: NextFunction): void {
  // Express serves /health/live/ as /health/live, so a trailing slash changes nothing.
  const path = request.path.replace(/(?<=.)\/$/, '');
  const served =
    path === `/${API_PREFIX}` ||
    path.startsWith(`/${API_PREFIX}/`) ||
    PROBES.includes(path.slice(1));
  next(served ? undefined : new NotFoundException(`Cannot ${request.method} ${request.path}`));
}
