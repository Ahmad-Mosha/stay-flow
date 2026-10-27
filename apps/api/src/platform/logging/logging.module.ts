import { Module } from '@nestjs/common';
import { LoggerModule, type Params } from 'nestjs-pino';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/env.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id.js';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Params => ({
        pinoHttp: {
          level: config.logLevel,
          // requestIdMiddleware has already assigned the id; reuse it so logs and responses match.
          genReqId: (request, response) => {
            if (typeof request.id === 'string') return request.id;
            const id = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
            response.setHeader(REQUEST_ID_HEADER, id);
            return id;
          },
          customLogLevel: (_request, response, error) => {
            if (error !== undefined || response.statusCode >= 500) return 'error';
            if (response.statusCode >= 400) return 'warn';
            return 'info';
          },
          // Probes hit these every few seconds; logging each one would bury real traffic.
          autoLogging: { ignore: (request) => request.url?.startsWith('/health/') ?? false },
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            remove: true,
          },
          ...(config.env === 'development'
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
  ],
})
export class LoggingModule {}
