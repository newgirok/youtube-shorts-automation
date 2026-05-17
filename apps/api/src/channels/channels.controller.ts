import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { ChannelsService } from './channels.service.js';
import { UpdateScheduleSchema } from './dto/update-schedule.dto.js';

@Controller('channels')
export class ChannelsController {
  constructor(@Inject(ChannelsService) private readonly service: ChannelsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id/schedule')
  updateSchedule(@Param('id') id: string, @Body() body: unknown) {
    const result = UpdateScheduleSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.issues);
    }
    return this.service.updateSchedule(id, result.data.cronExpression);
  }

  @Get(':id/analytics')
  getAnalytics(@Param('id') id: string) {
    return this.service.getAnalytics(id);
  }

  @Post(':id/sync-videos')
  syncVideos(@Param('id') id: string) {
    return this.service.syncVideos(id);
  }
}
