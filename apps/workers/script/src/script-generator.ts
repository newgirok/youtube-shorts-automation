import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MODEL = 'gemini-2.0-flash';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export interface ScriptOutput {
  title: string;
  hook: string;
  script: string;
  hashtags: string[];
  thumbnail_text: string;
  affiliate_product: string;
  affiliate_cta: string;
}

const SYSTEM_PROMPT = `당신은 YouTube Shorts 콘텐츠 전문가입니다. 주어진 주제로 45~55초 분량의 한국어 쇼츠 스크립트를 작성합니다.

반드시 다음 JSON 형식으로만 응답하세요:
{
  "title": "영상 제목 (40자 이내, #Shorts 포함)",
  "hook": "첫 3초 후킹 문장 (짧고 강렬하게)",
  "script": "전체 낭독 스크립트 (300~380자, 자연스러운 구어체)",
  "hashtags": ["#Shorts", "#해시태그1", "#해시태그2"],
  "thumbnail_text": "썸네일 텍스트 (15자 이내)",
  "affiliate_product": "관련 추천 상품명",
  "affiliate_cta": "쿠팡 파트너스 CTA 문구 (20자 이내, 예: '링크는 프로필에!')"
}`;

function parseOutput(text: string): ScriptOutput {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini 응답에서 JSON 파싱 실패');

  const parsed = JSON.parse(jsonMatch[0]) as Partial<ScriptOutput>;

  const required: (keyof ScriptOutput)[] = [
    'title', 'hook', 'script', 'hashtags', 'thumbnail_text', 'affiliate_product', 'affiliate_cta',
  ];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`스크립트 필드 누락: ${field}`);
  }

  return parsed as ScriptOutput;
}

export async function generateScript(topic: string, channelId: string): Promise<ScriptOutput> {
  const prompt = `${SYSTEM_PROMPT}\n\n채널 ID: ${channelId}\n주제: ${topic}\n\n위 주제로 YouTube Shorts 스크립트를 작성해주세요.`;
  const model = genAI.getGenerativeModel({ model: MODEL });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return parseOutput(result.response.text());
    } catch (err) {
      const status = typeof err === 'object' && err !== null ? (err as { status?: number }).status : undefined;
      if (status === 503 && attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Gemini 최대 재시도 초과');
}
