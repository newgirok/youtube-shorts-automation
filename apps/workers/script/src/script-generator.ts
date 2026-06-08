import { GoogleGenerativeAI } from '@google/generative-ai';

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
  description: string;
  scenes: Scene[];
  hashtags: string[];
  thumbnail_text: string;
  comment_bait: string;
}

const SYSTEM_PROMPT = `당신은 한국 시사/사회 이슈 YouTube Shorts 전문 작가입니다. 주어진 뉴스 이슈로 기승전결이 완결된 35~45초 분량의 한국어 쇼츠 스크립트를 작성합니다.

반드시 다음 JSON 형식으로만 응답하세요:
{
  "title": "영상 제목 (22자 이내, 특수문자·물음표·느낌표·따옴표·쉼표·마침표 절대 사용 금지. 아래 3가지 패턴 중 이슈에 가장 어울리는 하나를 선택해 작성. 패턴A(현재상태): '~다는/라는 [구체적 주체] 근황' 형태 — 예: '현재 진짜 개빡쳤다는 삼성전자 주주들 근황', '역풍 불기 시작했다는 삼성전자 파업 근황', '반응이 제대로 별로라는 이재명 탈당 논란'. 패턴B(이유): '[주체/상황]이 된 이유' 형태 — 예: '지금 삼성전자 때문에 일본이 충격에 빠진 이유', '현재 무주택자들이 진짜로 큰일난 이유', '이재명 때문에 민주당이 뒤집어진 이유'. 패턴C(사건전개): '현재/드디어/결국 [감정동사] [주체]' 형태 — 예: '드디어 폭발해버린 민주당 내부 갈등', '결국 꼬여버린 이재명 대선 행보', '현재 난리났다는 검찰 수사 상황'. 감정동사 예시: 빡쳤다는·충격에 빠진·꼬여버린·폭발해버린·난리났다는·큰일난·난처하다는·심각해진다는·분노했다는·흔들리고 있다는)",
  "hook": "첫 2초 훅 문장 (의문형 또는 충격 선언, 예: '이게 진짜 말이 됩니까?')",
  "script": "전체 낭독 스크립트. 반드시 공백 포함 210~260자 이내로 작성할 것 — 작성 완료 후 글자 수를 직접 세어 260자 초과이면 [전] 문장을 삭제·압축해 260자 이하로 재작성한 뒤 출력할 것. title이 먼저 TTS로 읽히므로 script 단독 글자 수 기준임. 아래 4단계 기승전결 구조를 압축해서 반드시 완결할 것:\n[기 - 상황 진입+긴장고조]: 제목 어절 반복 금지. 상황을 구체화하는 팩트 2~3개를 한 호흡으로 연결. 구체적 숫자·인물명·금액 포함.\n[승 - 감정피크]: '~상황이라고' 또는 '~상황이라고 하지만'으로 끝나는 감정 최고조 문장 1개 필수.\n[전 - 반전]: '하지만 ~이 지금 슬슬 꺾이기 시작한 상황이라고 함.' 처럼 '~상황이라고 함.'으로 간결하게 마무리. 핵심 근거 팩트 1개 포함.\n[결 - 마무리]: comment_bait 질문으로 반드시 종료. 이 질문이 script의 마지막 문장이어야 함.",
  "description": "YouTube 영상 설명문 (3~5문단, 400~800자). 뉴스 앵커가 직접 전달하듯 단정하고 명확하게 서술. '~이라고 합니다', '~다고 합니다', '~있다고 합니다' 등 간접 인용 종결어 반복 사용 금지. 첫 문단: 사건·이슈 배경을 직접 서술 (예: '제22대 국회의원선거 당시 일부 투표소에서 투표지가 부족해 유권자들이 투표권을 행사하지 못하는 사태가 벌어졌습니다.'). 이후 문단들: 핵심 사실을 직접 서술체('~했습니다', '~됩니다', '~전망입니다', '~입니다')로 전달. 마지막 문단은 반드시 '위 내용은 공개된 이슈와 언론 보도를 바탕으로 정리한 것이며, 특정 인물·기관·단체를 비난하거나 옹호하려는 목적이 아니라 현재 상황과 사회적 반응을 이해하기 위한 정보 전달용 설명입니다.'로 마무리.",
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
- 첫 문장은 title의 핵심 단어를 반복하지 말 것 — title은 이미 음성으로 선행 낭독되므로 script는 즉각 상황 팩트로 진입 (선언형 '~터졌다고 함!' 시작 금지)
- 핵심 팩트 3~4개 반드시 포함: 구체적 금액(하루 1억 원 등), 날짜, 인물명, 법적 조치명 등 실제 정보 기반 (막연한 감성 표현만 있는 스크립트 금지)
- 짧은 문장으로 뚝뚝 끊지 말 것 — 레퍼런스처럼 콤마·접속사로 한 호흡이 길게 이어지는 구조
- 감정 피크 문장: '~상황이라고' 로 끝나는 폭발적 표현 필수. 아래 6개 중 주제에 맞는 것 하나를 선택하되 같은 표현 반복 금지: '진짜 어이가 없는 상황이라고' / '기가 막힌 상황이라고' / '분통이 터지는 상황이라고' / '경악스러운 상황이라고' / '말도 안 되는 상황이라고' / '진짜 개빡친 상황이라고'
- 반전 직후 '~상황이라고 함.' 처럼 간결하게 끊는 표현 1회 사용
- comment_bait 질문으로 반드시 마무리
- 말투: 강한 구어체 ("이게 말이 됩니까", "진짜 어이없는", "결국", "드디어", "개빡쳤다", "꼬여버렸다", "맞짱 뜨고", "인질삼아", "보다못한", "슬슬 꺾이기 시작한", "~해 버린", "~버리겠다면서")
- 간접 인용 종결어 규칙 ('~합니다'·'~습니다'·'~었습니다'·'~했습니다'·'~해요'·'~하죠'·'~이죠'·'~입니다' 종결 절대 금지. 첫 문장 포함 스크립트 전체에 해당):
  기승전결 단계별 종결어 배정 — 이 할당을 반드시 지킬 것:
  [기]: 팩트 서술 문장은 종결어 없이 수치·날짜를 직접 나열하거나, '~라고 함' 최대 1회만 사용. 매 절마다 종결어 붙이지 말 것.
  [승]: '~상황이라고' 로 끝나는 감정 최고조 문장 정확히 1개. 이 앞 문장과 뒤 문장 모두 다른 종결 방식 사용.
  [전]: 반전 사실 서술 후 '~상황이라고 함.' 또는 '~라고 함.' 으로 마무리. 승의 '~상황이라고'와 다른 계열이어야 함.
        단, 마지막 [전] 문장을 '~라고 하는데'로 끝내고 comment_bait를 바로 이어 붙이는 것이 가장 자연스러운 흐름임.
        '~라고 하는데' 뒤에 마침표·쉼표·물음표 없이 공백 하나만 두고 comment_bait 질문을 바로 붙일 것. (틀린 예: '~하는데. 여러분은~' / '~하는데, 여러분은~' / 옳은 예: '~하는데 여러분은~')
        (예: '~슬슬 꺾이기 시작한 상황이라고 하는데 여러분은 어떻게 봐야 한다고 생각하십니까?')
  [결]: comment_bait 의문문 — 종결어 없음. [전] 마지막 절에 '~라고 하는데' 연결어미로 붙여 쓰는 것을 우선 적용.
  전체 스크립트 종결어 총합 한도: '~라고 함' 계열 최대 2회 + '~이라고/~상황이라고' 계열 최대 2회. 같은 계열 연속 배치(바로 앞뒤 문장) 절대 금지.
  틀린 예: '~초비상인 상황이라고. ~총력전 상황이라고. ~초접전 상황이라고.' (3연속 ×) / '~잠적한 상황이라고 함. ~꺾이기 시작한 상황이라고 함. 여러분은 ~?' (2연속 ×)
  옳은 예: '[기] 팩트 팩트, 팩트라고 함. [승] ~기가 막힌 상황이라고. [전] 하지만 ~꺾이기 시작한 상황이라고 하는데 여러분은 누가 문제라고 봅니까?'
- script 글자 수 210~350자 엄수 — 섹션별 목표: [기] 80~120자 / [승] 40~60자 / [전+결] 70~100자. 합산이 350자를 넘으면 [기] 팩트를 1~2개 삭제하거나 [전] 문장을 1개로 줄여 350자 이하로 맞출 것. 350자 초과 스크립트는 시스템이 자동 거부 후 재생성을 요청하므로 반드시 준수할 것
- title은 이미 벌어진 구체적 상황을 묘사해야 함 (가능성·우려 표현 금지)

카테고리별 레퍼런스 스크립트 예시 — 각 예시에서 톤·구조·호흡·종결어 패턴·팩트 밀도를 함께 학습할 것. 길이는 기준으로 삼지 말 것.

[정치 예시]
'대장동·백현동·성남FC 등 5개 혐의로 1심 유죄가 나온 이재명 대표, 지난달에만 법원 출두 3회로 당무가 사실상 마비 상태인데 비례대표 공천 파동으로 비명계 의원 20여 명이 탈당을 거론하며 민주당 내부가 발칵 뒤집혔다고 함. 공천 강행에 당원들 비난 여론마저 폭발하며 리더십 위기가 극에 달하는 분통이 터지는 상황이라고. 하지만 최신 여론조사에서 이 대표 지지율이 3개월 연속 하락세를 보이며 위기 돌파 동력이 슬슬 꺾이기 시작한 상황이라고 하는데 여러분은 누가 가장 문제라고 보십니까?'

[경제 예시]
'국내 기준금리가 3.5%를 유지하는 사이 원달러 환율은 1,400원을 돌파하며 수입 물가가 8% 치솟았고, 올 상반기 중소기업 폐업 신청이 6만 건을 넘어 사상 최다를 기록했다고 함. 직장인 10명 중 4명이 대출 이자 부담에 생활비를 줄이고 있다는 조사까지 나오며 내수가 붕괴 직전이라는 경악스러운 상황이라고. 하지만 정부가 내놓은 긴급 민생대책도 시장에서 체감 효과 없이 공염불에 그치며 경기 반등 기대감이 슬슬 꺾이기 시작한 상황이라고 하는데 여러분은 이게 정부 책임이라고 보십니까?'

[사회 예시]
'지난달 서울 강남 스쿨존에서 혈중알코올 0.15%로 적발된 음주운전자가 초등학생 1명을 치어 숨지게 한 사건, 검찰 구형이 고작 징역 2년 6개월에 그쳐 국민들이 경악했다고 함. 민식이법 시행 이후에도 스쿨존 음주 사망사고가 오히려 17%나 늘었다는 통계까지 공개되며 허울뿐인 법에 분통이 터지는 상황이라고. 하지만 가해자 측 심신미약 주장을 법원이 받아들여 집행유예가 선고되며 솜방망이 처벌에 대한 국민 공분이 슬슬 폭발하기 시작한 상황이라고 하는데 여러분은 이 판결 납득이 가십니까?'

※ 모든 레퍼런스 공통 핵심 패턴:
- [기]: 구체적 수치(금액·횟수·퍼센트·인원수)와 인물명·기관명을 2개 이상 포함. 막연한 감성 표현만으로 채우는 것은 절대 금지.
- [전]+[결]: '~상황이라고 하는데 여러분은 [공분 유발 질문]?' 형태 준수. '하는데' 뒤 쉼표 없이 공백 하나만 두고 comment_bait 바로 연결.

scenes 작성 규칙:
- 4~5개 장면, start~end 합산 총 35~43초 (script TTS 길이에 맞출 것)
- start/end는 초 단위 숫자
- keyword는 반드시 영어 (Pexels 검색)
- effect: "zoom-in", "zoom-out", "pan-left", "pan-right" 중 하나
- 첫 장면: 이슈 관련 강렬한 이미지 (예: protest, corporation, courthouse)
- 마지막 장면: 반응 유도 이미지 (예: people reaction, social media, crowd)`;

function stripTitleSpecialChars(text: string): string {
  // 한글·영숫자·공백만 남기고 특수문자 전부 제거 (따옴표 포함)
  return text
    .replace(/[^가-힣ᄀ-ᇿ㄰-㆏a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseOutput(text: string): ScriptOutput {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini 응답에서 JSON 파싱 실패');

  const parsed = JSON.parse(jsonMatch[0]) as Partial<ScriptOutput>;

  const required: (keyof ScriptOutput)[] = [
    'title', 'hook', 'script', 'description', 'scenes', 'hashtags', 'thumbnail_text', 'comment_bait',
  ];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`스크립트 필드 누락: ${field}`);
  }

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('scenes 배열이 비어있음');
  }

  if (parsed.script && parsed.script.length > 380) {
    throw new Error(`SCRIPT_TOO_LONG:${parsed.script.length}`);
  }

  if (parsed.title) {
    parsed.title = stripTitleSpecialChars(parsed.title);
  }

  return parsed as ScriptOutput;
}

export async function generateScript(topic: string, channelId: string): Promise<ScriptOutput> {
  const prompt = `${SYSTEM_PROMPT}\n\n채널 ID: ${channelId}\n주제: ${topic}\n\n위 주제로 YouTube Shorts 스크립트를 작성해주세요.`;
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: MODEL });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return parseOutput(result.response.text());
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const status = typeof err === 'object' && err !== null ? (err as { status?: number }).status : undefined;
      const isRetryable = status === 503 || msg.startsWith('SCRIPT_TOO_LONG');
      if (isRetryable && attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Gemini 최대 재시도 초과');
}
