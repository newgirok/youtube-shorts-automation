import { Module, Controller, Get } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JobsModule } from './jobs/jobs.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { AuthModule } from './auth/auth.module.js';
import { InternalKeyGuard } from './auth/internal-key.guard.js';
import { Public } from './auth/public.decorator.js';

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [JobsModule, ChannelsModule, AuthModule],
  controllers: [HealthController],
  providers: [Reflector, { provide: APP_GUARD, useClass: InternalKeyGuard }],
})
export class AppModule {}
