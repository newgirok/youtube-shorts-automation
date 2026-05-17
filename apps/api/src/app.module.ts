import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JobsModule } from './jobs/jobs.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { AuthModule } from './auth/auth.module.js';
import { InternalKeyGuard } from './auth/internal-key.guard.js';

@Module({
  imports: [JobsModule, ChannelsModule, AuthModule],
  providers: [{ provide: APP_GUARD, useClass: InternalKeyGuard }],
})
export class AppModule {}
