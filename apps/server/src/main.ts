import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  // Render puts the server behind one proxy; this makes req.ip the real client address.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({ origin: config.get('PUBLIC_WEB_URL', { infer: true }), credentials: true });
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(`Ownstream server listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
