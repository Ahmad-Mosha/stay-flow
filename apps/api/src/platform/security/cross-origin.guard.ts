import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { AppError } from '../errors/app-error.js';
import { isUntrustedCrossOrigin } from './cross-origin.js';

/** Turns away state-changing requests that a page on an untrusted origin made a browser send. */
@Injectable()
export class CrossOriginGuard implements CanActivate {
  private readonly trustedOrigins: ReadonlySet<string>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.trustedOrigins = new Set(config.http.trustedOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const source = {
      method: request.method,
      host: request.host,
      origin: request.header('origin'),
      secFetchSite: request.header('sec-fetch-site'),
    };
    if (isUntrustedCrossOrigin(source, this.trustedOrigins)) {
      throw new AppError(
        'CROSS_ORIGIN_REQUEST',
        'This request came from a page that is not allowed to change data here.',
      );
    }
    return true;
  }
}
