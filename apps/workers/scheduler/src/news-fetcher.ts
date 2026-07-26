import { get } from 'node:https';

export type NewsCategory = 'top' | 'business' | 'technology' | 'health' | 'science' | 'nation';

const CATEGORY_URLS: Record<NewsCategory, string> = {
  top: 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko',
  business: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko',
  technology: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ko&gl=KR&ceid=KR:ko',
  health: 'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=ko&gl=KR&ceid=KR:ko',
  science: 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=ko&gl=KR&ceid=KR:ko',
  nation: 'https://news.google.com/rss/headlines/section/topic/NATION?hl=ko&gl=KR&ceid=KR:ko',
};

export interface NewsItem {
  title: string;
  source: string;
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' } }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const BLOCK_KEYWORDS = [
  // 정당
  '민주당', '국민의힘', '정의당', '개혁신당', '조국혁신당',
  // 주요 정치인
  '이재명', '한동훈', '윤석열',
  // 여야 관계
  '여당', '야당',
  // 선거
  '총선', '대선', '지방선거',
  // 당직·의회 정치
  '당대표', '원내대표', '국회의원',
  // 정치 사법 절차
  '탄핵', '특검',
];

function isPolitical(title: string): boolean {
  return BLOCK_KEYWORDS.some((kw) => title.includes(kw));
}

function parseRssItems(xml: string, count: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xml)) !== null && items.length < count) {
    const content = match[1]!;
    const rawTitle =
      content.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ??
      content.match(/<title>([\s\S]*?)<\/title>/)?.[1] ??
      '';
    const source = content.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? '';

    const title = decodeEntities(rawTitle).replace(/ - [^-]+$/, '').trim();
    if (title) items.push({ title, source: decodeEntities(source) });
  }

  return items;
}

const CANDIDATES_PER_FETCH = 20;

export async function fetchNewsTopics(category: NewsCategory, count: number): Promise<NewsItem[]> {
  const url = CATEGORY_URLS[category];
  const xml = await fetchUrl(url);
  const candidates = parseRssItems(xml, CANDIDATES_PER_FETCH);
  return candidates.filter((item) => !isPolitical(item.title)).slice(0, count);
}
