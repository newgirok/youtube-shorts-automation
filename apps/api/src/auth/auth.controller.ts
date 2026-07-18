import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get('youtube')
  initiateYouTubeOAuth(@Query('userId') userId: string, @Res() res: FastifyReply) {
    const url = this.authService.getAuthUrl(userId);
    res.code(302).redirect(url);
  }

  @Get('youtube/callback')
  async handleYouTubeCallback(
    @Query('code') code: string,
    @Query('error') error: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: FastifyReply,
  ) {
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3001';
    if (error) {
      res.code(302).redirect(`${webOrigin}/close?auth_error=${encodeURIComponent(error)}`);
      return;
    }
    const channel = await this.authService.handleCallback(code, state);
    res.code(302).redirect(`${webOrigin}/close?channelId=${channel.id}`);
  }
}
