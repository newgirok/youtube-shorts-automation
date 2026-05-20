import { createReadStream } from 'node:fs';
import { google } from 'googleapis';

interface ScriptContent {
  title: string;
  hashtags: string[];
}

export async function uploadToYouTube(
  videoPath: string,
  scriptContent: ScriptContent,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const title = scriptContent.title.includes('#Shorts')
    ? scriptContent.title
    : `${scriptContent.title} #Shorts`;

  const aiDisclosure = '⚠️ 이 영상은 AI가 생성한 스크립트·음성·이미지를 포함합니다.\n\n';
  const description = aiDisclosure + scriptContent.hashtags.join(' ');

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description,
        tags: scriptContent.hashtags.map((t) => t.replace('#', '')),
        categoryId: '25',
        defaultLanguage: 'ko',
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,
      },
    },
    media: {
      mimeType: 'video/mp4',
      body: createReadStream(videoPath),
    },
  });

  const videoId = response.data.id;
  if (!videoId) throw new Error('YouTube 업로드 실패: videoId 없음');
  return videoId;
}
