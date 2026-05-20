import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export interface Scene {
  start: number;
  end: number;
  text: string;
  keyword: string;
  effect: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
}

export interface ScriptOutput {
  title: string;
  hook: string;
  script: string;
  scenes: Scene[];
  hashtags: string[];
  thumbnail_text: string;
  comment_bait: string;
}

const SYSTEM_PROMPT = `당신은 한국 시사/사회 이슈 YouTube Shorts 전문 작가입니다. 주어진 뉴스 이슈로 25~35초 분량의 한국어 쇼츠 스크립트를 작성합니다.

반드시 다음 JSON 형식으로만 응답하세요:
{
  "title": "영상 제목 (20자 이내, 충격적이고 클릭을 유도, 예: '삼성전자 노조 결국')",
  "hook": "첫 2초 훅 문장 (의문형 또는 충격 선언, 예: '이게 진짜 말이 됩니까?')",
  "script": "전체 낭독 스크립트 (180~250자, 빠른 구어체, comment_bait 문장으로 마무리)",
  "scenes": [
    {
      "start": 0,
      "end": 6,
      "text": "해당 구간 낭독 텍스트",
      "keyword": "Pexels 검색용 영어 키워드 (2~3단어)",
      "effect": "zoom-in"
    }
  ],
  "hashtags": ["#Shorts", "#시사", "#뉴스", "#해시태그1"],
  "thumbnail_text": "썸네일 임팩트 문구 (8자 이내, 충격·분노·공분 유발, 예: '결국터짐', '민심폭발', '전국난리', '초비상', '여론폭주', '망했다', '날벼락', '충격반전')",
  "comment_bait": "댓글 유도 질문 (25자 이내, 공분·논란·의견 충돌 유발, 예: '이거 진짜 정상인가요?', '여러분은 누가 문제라고 봅니까?', '이 상황 이해되십니까?', '이건 선 넘은 거 아닌가요?', '이게 세금 낸 보람입니까?', '이 사람 처벌 받아야 하지 않나요?')"
}

스크립트 작성 필수 규칙:
- 반드시 hook 문장으로 시작
- 핵심 팩트 2~3개만 빠르게 전달 (장황한 설명 금지)
- comment_bait 질문으로 반드시 마무리
- 말투: 강한 구어체 ("이게 말이 됩니까", "진짜 어이없는", "결국", "드디어")
- 전체 낭독 시 25~35초 분량 유지

scenes 작성 규칙:
- 4~6개 장면 (각 5~8초)
- start/end는 초 단위 숫자
- keyword는 반드시 영어 (Pexels 검색)
- effect: "zoom-in", "zoom-out", "pan-left", "pan-right" 중 하나
- 첫 장면: 이슈 관련 강렬한 이미지 (예: protest, corporation, courthouse)
- 마지막 장면: 반응 유도 이미지 (예: people reaction, social media, crowd)`;

function parseOutput(text: string): ScriptOutput {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini 응답에서 JSON 파싱 실패');

  const parsed = JSON.parse(jsonMatch[0]) as Partial<ScriptOutput>;

  const required: (keyof ScriptOutput)[] = [
    'title', 'hook', 'script', 'scenes', 'hashtags', 'thumbnail_text', 'comment_bait',
  ];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`스크립트 필드 누락: ${field}`);
  }

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('scenes 배열이 비어있음');
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
