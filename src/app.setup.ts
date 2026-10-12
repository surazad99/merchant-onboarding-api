import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

/** Shared by main.ts and the e2e tests so both run with identical pipes/middleware. */
export function configureApp(app: INestApplication, opts: { swagger?: boolean } = {}): void {
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // ...and reject them (blocks mass-assignment of e.g. createdById/status)
      transform: true,
    }),
  );

  if (opts.swagger) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Merchant Onboarding API')
        .setDescription('Merchant applications, RBAC + object-level authorization, async risk review')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
}
