import { writeFileSync, createWriteStream } from 'node:fs';
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

export async function generateBackgroundImage(
  topic: string,
  outputPath: string,
  apiKey: string
): Promise<void> {
  // 토픽에서 영문 키워드 추출 (Pexels는 영어 검색이 더 정확)
  const keyword = encodeURIComponent(topic.replace(/[^\w\s가-힣]/g, ' ').trim());

  const url = `https://api.pexels.com/v1/search?query=${keyword}&orientation=portrait&size=large&per_page=5`;

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
  if (photos.length === 0) throw new Error(`Pexels 검색 결과 없음: ${topic}`);

  const photoUrl = photos[Math.floor(Math.random() * photos.length)]!.src.portrait;
  await downloadFile(photoUrl, outputPath);
}
