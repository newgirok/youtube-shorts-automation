import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { JobsService } from './jobs.service.js';
import { CreateJobSchema } from './dto/create-job.dto.js';
import { AutoNewsJobSchema } from './dto/auto-news.dto.js';
import { JobNotFoundError, JobNotRetryableError, DailyQuotaExceededError } from './jobs.errors.js';
import { Public } from '../auth/public.decorator.js';

@Controller('jobs')
export class JobsController {
  constructor(@Inject(JobsService) private readonly service: JobsService) {}

  @Post()
  async create(@Body() body: unknown) {
    const result = CreateJobSchema.safeParse(body);
    if (!result.success) throw new BadRequestException(result.error.issues);
    try {
      return await this.service.create(result.data.channelId, result.data.topic);
    } catch (err) {
      if (err instanceof DailyQuotaExceededError) throw new HttpException(err.message, HttpStatus.TOO_MANY_REQUESTS);
      throw err;
    }
  }

  @Get()
  findMany(@Query('channelId') channelId?: string) {
    return this.service.findMany(channelId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const job = await this.service.findById(id);
    if (!job) throw new NotFoundException(`Job ${id} 를 찾을 수 없습니다`);
    return job;
  }

  @Post('auto-news')
  async autoNews(@Body() body: unknown) {
    const result = AutoNewsJobSchema.safeParse(body);
    if (!result.success) throw new BadRequestException(result.error.issues);
    try {
      return await this.service.createFromNews(result.data);
    } catch (err) {
      if (err instanceof DailyQuotaExceededError) throw new HttpException(err.message, HttpStatus.TOO_MANY_REQUESTS);
      throw err;
    }
  }

  @Public()
  @Get(':id/thumbnail')
  async getThumbnail(@Param('id') id: string, @Res() res: FastifyReply) {
    const buffer = await this.service.getThumbnail(id);
    if (!buffer) throw new NotFoundException(`Job ${id}의 썸네일이 없습니다`);
    void res.type('image/jpeg').send(buffer);
  }

  @Post(':id/retry')
  async retry(@Param('id') id: string) {
    try {
      return await this.service.retry(id);
    } catch (err) {
      if (err instanceof JobNotFoundError) throw new NotFoundException(err.message);
      if (err instanceof JobNotRetryableError) throw new BadRequestException(err.message);
      throw err;
    }
  }
}
