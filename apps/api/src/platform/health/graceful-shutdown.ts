import type { Server, ServerResponse } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import type { AppConfig, HttpConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';

/**
 * Stops the API without failing the requests it has started. On SIGTERM it reports not ready, so
 * the load balancer stops sending traffic, and keeps serving for the drain delay. Then Nest stops
 * accepting connections and waits for the requests in flight. Past the timeout, it cuts off the
 * ones left, so a stuck request cannot hold up a deploy.
 */
@Injectable()
export class GracefulShutdown implements BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly config: HttpConfig;
  private state: 'serving' | 'draining' | 'closing' = 'serving';
  private readonly inFlight = new Set<ServerResponse>();
  private deadline: NodeJS.Timeout | undefined;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly adapterHost: HttpAdapterHost,
    // Not @InjectPinoLogger(): it only works for classes imported before the LoggerModule is.
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(GracefulShutdown.name);
    this.config = config.http;
  }

  /** False once shutdown starts, so readiness checks fail. */
  get ready(): boolean {
    return this.state === 'serving';
  }

  /** Express middleware, first in the chain: keeps track of the requests in flight. */
  readonly track = (_request: Request, response: Response, next: NextFunction): void => {
    if (this.state === 'closing') {
      response.setHeader('Connection', 'close');
    } else {
      this.inFlight.add(response);
      response.once('close', () => this.inFlight.delete(response));
    }
    next();
  };

  async beforeApplicationShutdown(): Promise<void> {
    this.state = 'draining';
    this.logger.info({ drainDelayMs: this.config.drainDelayMs }, 'Shutting down, no longer ready');
    await sleep(this.config.drainDelayMs);

    this.state = 'closing';
    // Node keeps a keep-alive connection open, and serving, after its response. Closing each
    // connection once its response is out lets the server close as soon as the last one ends.
    for (const response of this.inFlight) {
      if (!response.headersSent) {
        response.setHeader('Connection', 'close');
      }
    }
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    this.deadline = setTimeout(() => {
      this.logger.warn(
        { inFlight: this.inFlight.size },
        'Shutdown timed out, cutting off requests',
      );
      server.closeAllConnections();
    }, this.config.shutdownTimeoutMs).unref();
    // Nest closes the server next, and waits for the requests in flight.
  }

  onApplicationShutdown(): void {
    clearTimeout(this.deadline);
  }
}
