import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();

const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
  // Hold early framework logs until the pino logger is attached, so every line is structured.
  bufferLogs: true,
});
configureApp(app);

await app.listen(config.port);
