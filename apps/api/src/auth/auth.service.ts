import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { prisma, createLogger } from '@shorts/shared';
import { encrypt } from './crypto.js';

const log = createLogger({});

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

function createOAuth2Client(): OAuth2Client {
  return new OAuth2Client(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI,
  );
}

@Injectable()
export class AuthService {
  getAuthUrl(userId: string, loginHint?: string): string {
    const client = createOAuth2Client();
    return client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: userId,
      ...(loginHint ? { login_hint: loginHint } : {}),
    });
  }

  async handleCallback(code: string, state?: string): Promise<{ id: string }> {
    log.info('OAuth 콜백 처리 시작');
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('refresh_token 없음 — 기존 앱 접근 취소 후 재시도 필요');
    }

    client.setCredentials(tokens);
    const { google } = await import('googleapis');
    const yt = google.youtube({ version: 'v3', auth: client });
    const channelRes = await yt.channels.list({ part: ['snippet', 'statistics'], mine: true });
    const ytChannel = channelRes.data.items?.[0];
    if (!ytChannel) {
      throw new Error('YouTube 채널 없음');
    }

    const encryptedRefreshToken = encrypt(tokens.refresh_token);
    const userId = state;
    if (!userId) throw new Error('userId가 없습니다 — OAuth 흐름을 다시 시작하세요');

    const channel = await prisma.channel.upsert({
      where: { youtubeId: ytChannel.id! },
      create: {
        youtubeId: ytChannel.id!,
        name: ytChannel.snippet?.title ?? '',
        niche: '',
        refreshToken: encryptedRefreshToken,
        uploadSchedule: '0 9 * * *',
        isActive: true,
        userId,
        subscriberCount: parseInt(ytChannel.statistics?.subscriberCount ?? '0', 10),
        totalViews: parseInt(ytChannel.statistics?.viewCount ?? '0', 10),
        createdAt: new Date(ytChannel.snippet?.publishedAt ?? Date.now()),
      },
      update: {
        refreshToken: encryptedRefreshToken,
        name: ytChannel.snippet?.title ?? '',
        isActive: true,
      },
      select: { id: true },
    });

    log.info({ channelId: channel.id }, 'OAuth 콜백 처리 완료 — 채널 upsert 성공');
    return channel;
  }
}
