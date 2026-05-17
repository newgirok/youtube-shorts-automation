import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { JobsRepository } from './jobs.repository.js';

@Module({
  controllers: [JobsController],
  providers: [JobsService, JobsRepository],
})
export class JobsModule {}
