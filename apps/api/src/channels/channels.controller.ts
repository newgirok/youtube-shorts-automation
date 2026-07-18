import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { ChannelsService } from './channels.service.js';
import { UpdateScheduleSchema } from './dto/update-schedule.dto.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('channels')
export class ChannelsController {
  constructor(@Inject(ChannelsService) private readonly service: ChannelsService) {}

  @Get()
  findAll(@CurrentUser() userId: string | undefined) {
    return this.service.findAll(userId);
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
    return this.service.updateSchedule(id, result.data);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }

  @Get(':id/analytics')
  getAnalytics(@Param('id') id: string) {
    return this.service.getAnalytics(id);
  }

  @Post(':id/sync-videos')
  syncVideos(@Param('id') id: string) {
    return this.service.syncVideos(id);
  }

  @Post(':id/sync')
  syncChannel(@Param('id') id: string) {
    return this.service.syncChannel(id);
  }
}
