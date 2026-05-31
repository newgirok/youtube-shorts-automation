import { createWriteStream } from 'node:fs';
import { get } from 'node:https';

async function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(outputPath);
    get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        downloadFile(res.headers.location!, outputPath).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve as () => void));
    }).on('error', reject);
  });
}

export async function downloadSceneImage(
  keyword: string,
  outputPath: string,
  apiKey: string
): Promise<void> {
  const query = `korean ${keyword}`;
  const encoded = encodeURIComponent(query);
  const page = Math.floor(Math.random() * 3) + 1;
  const url = `https://api.pexels.com/v1/search?query=${encoded}&orientation=portrait&size=large&per_page=15&page=${page}`;

  const data = await new Promise<string>((resolve, reject) => {
    get(url, { headers: { Authorization: apiKey } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
      res.on('error', reject);
    }).on('error', reject);
  });

  const json = JSON.parse(data) as {
    photos?: Array<{ src: { portrait: string } }>;
  };

  const photos = json.photos ?? [];
  if (photos.length === 0) throw new Error(`Pexels 검색 결과 없음: ${keyword}`);

  const photoUrl = photos[Math.floor(Math.random() * photos.length)]!.src.portrait;
  await downloadFile(photoUrl, outputPath);
}

export async function downloadSceneVideo(
  keyword: string,
  outputPath: string,
  apiKey: string
): Promise<void> {
  const query = `korean ${keyword}`;
  const encoded = encodeURIComponent(query);
  const page = Math.floor(Math.random() * 3) + 1;
  const url = `https://api.pexels.com/videos/search?query=${encoded}&orientation=portrait&size=large&per_page=15&page=${page}`;

  const data = await new Promise<string>((resolve, reject) => {
    get(url, { headers: { Authorization: apiKey } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
      res.on('error', reject);
    }).on('error', reject);
  });

  const json = JSON.parse(data) as {
    videos?: Array<{
      video_files: Array<{ link: string; quality: string }>;
    }>;
  };

  const videos = json.videos ?? [];
  if (videos.length === 0) throw new Error(`Pexels 동영상 검색 결과 없음: ${keyword}`);

  // 랜덤으로 다른 결과 선택 (씬마다 다양한 영상)
  const picked = videos[Math.floor(Math.random() * videos.length)]!;
  const files = picked.video_files;
  const selected = files.find(f => f.quality === 'hd') ?? files[0];
  if (!selected) throw new Error(`Pexels 동영상 검색 결과 없음: ${keyword}`);

  await downloadFile(selected.link, outputPath);
}
