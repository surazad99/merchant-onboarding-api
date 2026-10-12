import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app, { swagger: process.env.NODE_ENV !== 'production' });
  app.enableShutdownHooks(); // lets the BullMQ worker finish/close cleanly on SIGTERM

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on :${port} (Swagger at /docs when not in production)`);
}
bootstrap();
