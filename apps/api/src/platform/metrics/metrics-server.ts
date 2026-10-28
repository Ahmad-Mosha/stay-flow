import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Metrics } from './metrics.js';

/** The port to serve metrics on, or undefined to serve none. */
export const METRICS_PORT = Symbol('METRICS_PORT');

/**
 * Serves GET /metrics to Prometheus on a port of its own. Off the public port, the metrics reach
 * only the network that scrapes them. The worker, which serves no HTTP, serves them the same way.
 */
@Injectable()
export class MetricsServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private server: Server | undefined;

  constructor(
    private readonly metrics: Metrics,
    @Inject(METRICS_PORT) private readonly port: number | undefined,
    // Not @InjectPinoLogger(): it only works for classes imported before the LoggerModule is.
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(MetricsServer.name);
  }

  /** Where it listens, once started. Undefined when metrics are off. */
  get address(): AddressInfo | undefined {
    return (this.server?.address() ?? undefined) as AddressInfo | undefined;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.port === undefined) {
      return;
    }
    this.server = createServer((request, response) => {
      void this.serve(request, response);
    });
    this.server.listen(this.port);
    await once(this.server, 'listening');
  }

  /** Runs last, so metrics stay available while the API drains. */
  async onApplicationShutdown(): Promise<void> {
    if (this.server === undefined) {
      return;
    }
    const closed = once(this.server, 'close');
    this.server.close();
    // Prometheus keeps its connection alive between scrapes. Nothing is lost by cutting it.
    this.server.closeAllConnections();
    await closed;
  }

  private async serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'GET' || request.url !== '/metrics') {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await this.metrics.registry.metrics();
      response.writeHead(200, { 'Content-Type': this.metrics.registry.contentType }).end(body);
    } catch (error) {
      this.logger.error({ err: error }, 'Could not collect metrics');
      response.writeHead(500).end();
    }
  }
}
