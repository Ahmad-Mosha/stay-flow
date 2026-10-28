import { Module } from '@nestjs/common';
import { LoggerModule, type Params } from 'nestjs-pino';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id.js';

function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      genReqId: (request, response) => {
        if (typeof request.id === 'string') return request.id;
        const id = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
        response.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      // Logs made while serving a request carry only its id. The request itself is logged once,
      // when it completes.
      quietReqLogger: true,
      customAttributeKeys: { reqId: 'requestId' },
      customLogLevel: (_request, response, error) => {
        if (error !== undefined || response.statusCode >= 500) return 'error';
        if (response.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: { ignore: (request) => request.url?.startsWith('/health/') ?? false },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        remove: true,
      },
      ...(config.env === 'development'
        ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
        : {}),
    },
  };
}

@Module({
  imports: [LoggerModule.forRootAsync({ inject: [APP_CONFIG], useFactory: loggerParams })],
})
export class LoggingModule {}
