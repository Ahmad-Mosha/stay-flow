import type { NextFunction, Request, Response } from 'express';
import type { Metrics } from './metrics.js';

/** Express middleware that times every request, including those the client gives up on. */
export function httpMetricsMiddleware(metrics: Metrics) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const stopTimer = metrics.httpRequestDuration.startTimer();
    response.once('close', () => {
      stopTimer({
        method: request.method,
        route: routeOf(request),
        // 499, as nginx logs it, when the client hung up before the response was sent.
        status_code: response.writableFinished ? String(response.statusCode) : '499',
      });
    });
    next();
  };
}

/**
 * The route pattern, such as /v1/properties/:slug, so all properties share one series. Nest
 * answers a path no route matches from a catch-all route, `*path`: those share one series too.
 */
function routeOf(request: Request): string {
  const route = request.route as { path?: unknown } | undefined;
  return typeof route?.path === 'string' && !route.path.startsWith('*') ? route.path : 'unmatched';
}
