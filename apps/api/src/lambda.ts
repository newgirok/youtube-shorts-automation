import 'reflect-metadata';

// BigInt JSON 직렬화
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

const REQUIRED_ENV = [
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REDIRECT_URI',
  'ENCRYPTION_KEY',
  'SQS_SCRIPT_QUEUE_URL',
  'API_INTERNAL_SECRET',
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`[ENV] 누락된 환경변수: ${key}`);
  }
}

import { parseBaseEnv } from '@shorts/shared';
parseBaseEnv();

import awsLambdaFastify from '@fastify/aws-lambda';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import type { Handler } from 'aws-lambda';

let cachedProxy: ReturnType<typeof awsLambdaFastify> | null = null;

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3001',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.init();
  const fastify = app.getHttpAdapter().getInstance();
  return awsLambdaFastify(fastify, { callbackWaitsForEmptyEventLoop: false });
}

export const handler: Handler = async (event, context) => {
  if (!cachedProxy) {
    cachedProxy = await bootstrap();
  }
  return cachedProxy(event, context);
};
