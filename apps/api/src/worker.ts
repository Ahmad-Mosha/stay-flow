import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadConfig } from './config/config.js';
import { WorkerModule } from './worker.module.js';

const config = loadConfig();

const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), {
  bufferLogs: true,
});
app.useLogger(app.get(Logger));
// On SIGTERM, the worker finishes the event in hand and hands back the rest before it exits.
app.enableShutdownHooks();
