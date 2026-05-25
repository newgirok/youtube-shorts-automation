import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service.js';
import { ChannelsModule } from '../channels/channels.module.js';
import { JobsModule } from '../jobs/jobs.module.js';

@Module({
  imports: [ScheduleModule.forRoot(), ChannelsModule, JobsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
