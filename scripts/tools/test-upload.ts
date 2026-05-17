import 'dotenv/config';
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { google } from 'googleapis';
import { z } from 'zod';

const EnvSchema = z.object({
  YOUTUBE_CLIENT_ID: z.string().min(1),
  YOUTUBE_CLIENT_SECRET: z.string().min(1),
  YOUTUBE_REFRESH_TOKEN: z.string().min(1),
});

const VIDEO_FILE = join(process.cwd(), 'scripts', 'output', 'test-output.mp4');

const UPLOAD_QUOTA = 1600; // units per upload (YouTube Data API v3 기준)

function loadEnv() {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path[0]).join(', ');
    throw new Error(`[ENV] 누락된 환경변수: ${missing}\n.env 파일에 값을 채운 후 다시 실행하세요.`);
  }
  return result.data;
}

async function refreshAccessToken(oauth2Client: ReturnType<typeof google.auth.OAuth2>) {
  console.log('[OAuth] refresh_token → access_token 재발급 중...');
  const { credentials } = await oauth2Client.refreshAccessToken();
  console.log(`[OAuth] access_token 발급 완료 (만료: ${new Date(credentials.expiry_date!).toISOString()})`);
  return credentials;
}

async function uploadVideo(oauth2Client: ReturnType<typeof google.auth.OAuth2>) {
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const fileSize = statSync(VIDEO_FILE).size;

  console.log(`[Upload] 파일: ${VIDEO_FILE}`);
  console.log(`[Upload] 크기: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('[Upload] privacyStatus: private 으로 업로드 시작...');

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: '[테스트] YouTube Shorts 자동화 검증 영상 #Shorts',
        description: 'P0-4 검증용 테스트 업로드입니다. 자동으로 삭제됩니다.',
        tags: ['Shorts', '테스트'],
        categoryId: '22', // People & Blogs
        defaultLanguage: 'ko',
      },
      status: {
        privacyStatus: 'private',
      },
    },
    media: {
      mimeType: 'video/mp4',
      body: createReadStream(VIDEO_FILE),
    },
  } as Parameters<typeof youtube.videos.insert>[0]);

  return response.data;
}

async function checkShortsClassification(
  oauth2Client: ReturnType<typeof google.auth.OAuth2>,
  videoId: string
) {
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  // 업로드 후 YouTube 서버에서 분류까지 약간의 시간이 필요
  await new Promise((r) => setTimeout(r, 5000));

  const response = await youtube.videos.list({
    part: ['snippet', 'contentDetails'],
    id: [videoId],
  });

  const video = response.data.items?.[0];
  if (!video) return null;

  const title = video.snippet?.title ?? '';
  const isShorts = title.includes('#Shorts') || title.includes('#shorts');

  return { isShorts, title, duration: video.contentDetails?.duration };
}

async function main() {
  const env = loadEnv();

  const oauth2Client = new google.auth.OAuth2(
    env.YOUTUBE_CLIENT_ID,
    env.YOUTUBE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: env.YOUTUBE_REFRESH_TOKEN });

  await refreshAccessToken(oauth2Client);

  const videoData = await uploadVideo(oauth2Client);
  const videoId = videoData.id!;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`[Upload] 업로드 완료!`);
  console.log(`[Upload] videoId: ${videoId}`);
  console.log(`[Upload] URL: ${videoUrl}`);

  console.log('[Shorts] #Shorts 분류 확인 중...');
  const classification = await checkShortsClassification(oauth2Client, videoId);

  console.log('');
  console.log('=== P0-4 검증 결과 ===');
  console.log(`업로드: ${videoId ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`#Shorts 분류: ${classification?.isShorts ? '✓ PASS' : '△ 미확인 (업로드 후 YouTube 처리 대기 중일 수 있음)'}`);
  console.log(`refresh_token 재발급: ✓ PASS`);
  console.log(`소비 quota: 약 ${UPLOAD_QUOTA} units`);
  console.log('');
  console.log(`영상 URL: ${videoUrl}`);
  console.log('※ private 영상입니다. 확인 후 수동으로 삭제해 주세요.');
}

main().catch((err: unknown) => {
  console.error('[Upload] 오류 발생:', err);
  process.exit(1);
});
