import 'reflect-metadata';

// BigInt는 JSON.stringify 기본 지원 없음 — 문자열로 직렬화
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const REQUIRED_ENV_VARS = [
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REDIRECT_URI',
  'ENCRYPTION_KEY',
  'SQS_SCRIPT_QUEUE_URL',
  'API_INTERNAL_SECRET',
] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`[ENV] 누락된 환경변수: ${key}`);
  }
}

import { parseBaseEnv } from '@shorts/shared';
parseBaseEnv();

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3001' });
  await app.listen(3000, '0.0.0.0');
}

bootstrap();
