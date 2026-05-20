import { get } from 'node:https';

export type NewsCategory = 'top' | 'politics' | 'business' | 'nation';

const CATEGORY_URLS: Record<NewsCategory, string> = {
  top: 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko',
  politics: 'https://news.google.com/rss/headlines/section/topic/POLITICS?hl=ko&gl=KR&ceid=KR:ko',
  business: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko',
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

    // Google News 제목 형식: "기사 제목 - 언론사명" → 언론사명 제거
    const title = decodeEntities(rawTitle).replace(/ - [^-]+$/, '').trim();
    if (title) items.push({ title, source: decodeEntities(source) });
  }

  return items;
}

export async function fetchNewsTopics(category: NewsCategory, count: number): Promise<NewsItem[]> {
  const url = CATEGORY_URLS[category];
  const xml = await fetchUrl(url);
  return parseRssItems(xml, count);
}
