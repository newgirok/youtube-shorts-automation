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
  "script": "전체 낭독 스크립트. 반드시 공백 포함 210~260자 이내로 작성할 것 — 작성 완료 후 글자 수를 직접 세어 260자 초과이면 [전] 문장을 삭제·압축해 260자 이하로 재작성한 뒤 출력할 것. title이 먼저 TTS로 읽히므로 script 단독 글자 수 기준임. ※ 출력하는 script 텍스트에 [기], [승], [전], [결] 같은 구조 라벨을 절대 포함하지 말 것 — 아래 구조는 작성 가이드일 뿐이며 실제 음성·자막으로 그대로 출력됨. 아래 4단계 기승전결 구조를 압축해서 반드시 완결할 것:\n기(팩트 축적): 제목 어절 반복 금지. 인물명·기관명·수치 2~3개를 한 호흡으로 연결한 뒤 반드시 '~다고 함.'으로 끊을 것.\n승(감정 폭발): 6개 감정 표현 중 하나로 끝나는 문장 정확히 1개. '~상황이라고.'로 짧게 끊기.\n전(반전): '하지만'으로 시작해 반전 팩트 1문장 후 반드시 '~상황이라고 하는데.'로 마침표를 찍어 끊을 것. [결]과 분리된 독립 문장.\n결(시청자 참여): '여러분은 ...'으로 시작하는 의문형 질문 1개. [전] 다음 독립 문장으로 배치.",
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
  "comment_bait": "댓글 유도 질문 (25자 이내, 공분·논란·의견 충돌 유발). '이 상황 이해되십니까?', '이거 정상인가요?', '말이 됩니까?' 같은 무주제 일반 문장 사용 절대 금지. 반드시 영상의 구체적 이슈·주체·사건을 언급한 질문으로 작성할 것. 예: '여러분은 이번 경선 결과 납득하십니까?', '이 판결 정말 납득이 가십니까?', '이 사람 처벌 받아야 하지 않나요?', '이게 세금 낸 보람입니까?', '여러분은 누가 더 문제라고 봅니까?'"
}

스크립트 작성 필수 규칙:
- 첫 문장은 title의 핵심 단어를 반복하지 말 것 — title은 이미 음성으로 선행 낭독되므로 script는 즉각 상황 팩트로 진입 (선언형 '~터졌다고 함!' 시작 금지)
- script 의문형 위치 제한 — '~니까?', '~십니까?', '~겠습니까?', '~어떻습니까?' 등 의문형 종결은 script 전체에서 마지막 comment_bait 질문 딱 1회만 허용. 그 앞 어느 문장에도 의문형 절대 금지. hook 필드의 질문을 script 어디에도 복붙·반복하지 말 것
- script와 hook은 완전히 분리된 별개 필드 — hook은 오버레이 텍스트로 따로 표시되므로 script는 hook 내용을 이어받지 말고 즉각 팩트 서술로 시작
- 핵심 팩트 3~4개 반드시 포함: 구체적 금액(하루 1억 원 등), 날짜, 인물명, 법적 조치명 등 실제 정보 기반 (막연한 감성 표현만 있는 스크립트 금지)
- 짧은 문장으로 뚝뚝 끊지 말 것 — 레퍼런스처럼 콤마·접속사로 한 호흡이 길게 이어지는 구조
- 감정 피크 문장: '~상황이라고' 로 끝나는 폭발적 표현 필수. 아래 6개 중 주제에 맞는 것 하나를 선택하되 같은 표현 반복 금지: '진짜 어이가 없는 상황이라고' / '기가 막힌 상황이라고' / '분통이 터지는 상황이라고' / '경악스러운 상황이라고' / '말도 안 되는 상황이라고' / '진짜 개빡친 상황이라고'
- 반전 직후 '~상황이라고 함.' 처럼 간결하게 끊는 표현 1회 사용
- comment_bait 질문으로 반드시 마무리
- 말투: 강한 구어체 ("이게 말이 됩니까", "진짜 어이없는", "결국", "드디어", "개빡쳤다", "꼬여버렸다", "맞짱 뜨고", "인질삼아", "보다못한", "슬슬 꺾이기 시작한", "~해 버린", "~버리겠다면서")
- 기관명·단체명 뒤 영문 약자 괄호 표기 금지 — TTS가 괄호와 영문을 그대로 읽어 어색해짐. 한국어 명칭만 사용할 것. (예: '주택도시보증공사(HUG)' → '주택도시보증공사')
- 간접 인용 종결어 규칙 ('~합니다'·'~습니다'·'~었습니다'·'~했습니다'·'~해요'·'~하죠'·'~이죠'·'~입니다' 종결 절대 금지. 첫 문장 포함 스크립트 전체에 해당):
  기승전결 4박자 종결어 — 이 할당을 반드시 지킬 것:
  [기]: 인물명·기관명·수치를 2~3개 한 호흡으로 연결한 뒤 반드시 '~다고 함.' 또는 '~됐다고 함.'으로 끊을 것. 종결어 없이 절이 끝나는 것 금지. '~이라고/~상황이라고/~거라고' 계열 사용 금지.
  [승]: 아래 6개 중 하나로 끝나는 감정 최고조 문장 정확히 1개. 반복 금지. 설명 추가 없이 짧게 끊을 것.
        '진짜 어이가 없는 상황이라고' / '기가 막힌 상황이라고' / '분통이 터지는 상황이라고' / '경악스러운 상황이라고' / '말도 안 되는 상황이라고' / '진짜 개빡친 상황이라고'
  [전]: '하지만'으로 시작해 반전 팩트 1문장 후 반드시 '~상황이라고 하는데.'로 마침표를 찍어 끊을 것. [결]과 분리된 독립 문장.
  [결]: '여러분은 ...'으로 시작하는 의문형 질문 1개. [전] 다음 독립 문장으로 배치. 영상의 구체적 이슈·주체·사건 언급 필수. 25자 이내.

  4박자 흐름: [기] ~다고 함. | [승] ~상황이라고. | [전] ~상황이라고 하는데. | [결] 여러분은 ...?
  옳은 예: '팩트 됐다고 함. / 기가 막힌 상황이라고. / 하지만 꺾이기 시작한 상황이라고 하는데. / 여러분은 누가 문제라고 보십니까?'

  전체 스크립트 종결어 총합 한도: '~라고 함' 계열 최대 2회 + '~이라고/~상황이라고' 계열 최대 2회. 같은 계열 연속 배치 절대 금지.
  ※ '~라고', '~거라고', '~이라고', '~상황이라고'는 모두 같은 계열 — 2연속도 금지.
- script 글자 수 210~350자 엄수 — 섹션별 목표: [기] 80~120자 / [승] 40~60자 / [전+결] 70~100자. 합산이 350자를 넘으면 [기] 팩트를 1~2개 삭제하거나 [전] 문장을 1개로 줄여 350자 이하로 맞출 것. 350자 초과 스크립트는 시스템이 자동 거부 후 재생성을 요청하므로 반드시 준수할 것
- title은 이미 벌어진 구체적 상황을 묘사해야 함 (가능성·우려 표현 금지)

카테고리별 레퍼런스 스크립트 예시 — 각 예시에서 톤·구조·호흡·종결어 패턴·팩트 밀도를 함께 학습할 것. 길이는 기준으로 삼지 말 것.

[정치 예시]
'감사원 감사 결과 방위사업청이 특정 방산 업체에 2년간 수의계약 형식으로 총 8천억 원 규모를 몰아준 정황이 드러나며 야당이 국정조사를 요구하고 나섰고, 고위 관계자 3명이 피의자 신분으로 검찰에 소환됐다고 함. 국민 세금으로 운영되는 방산 예산이 특혜 창구가 됐다는 의혹에 국회가 발칵 뒤집히는 말도 안 되는 상황이라고. 하지만 방사청 측은 절차상 문제없다는 입장을 고수하며 진상 규명 동력이 슬슬 꺾이기 시작한 상황이라고 하는데. 여러분은 이게 세금 낸 보람이 있다고 보십니까?'

[경제 예시]
'올해 상반기 수도권 전세 사기 피해 신고가 1만 2천 건을 돌파해 역대 최다를 기록했고, 주택도시보증공사의 구상권 회수율은 고작 4%에 그쳤다고 함. 피해자 70%가 20~30대 사회초년생으로 전 재산을 날린 상황인데 정부 대책은 여전히 공염불에 그치는 분통이 터지는 상황이라고. 하지만 전세 사기 특별법 적용 대상이 전체 피해자의 3분의 1에도 못 미치며 구제 기대감이 슬슬 꺾이기 시작한 상황이라고 하는데. 여러분은 이게 피해자만의 잘못이라고 보십니까?'

[사회 예시]
'경기도 한 중학교에서 학교폭력 피해를 호소하던 14세 학생이 극단적 선택을 한 사실이 드러났는데, 피해 학생이 담임교사에게 6차례 신고했음에도 학교 측이 학폭위 소집을 석 달 넘게 지연했다고 함. 가해자 학부모가 학교운영위원으로 재직 중이었다는 사실까지 드러나며 기가 막힌 상황이라고. 하지만 교육청 감사에서도 담임교사 경고 처분에 그치며 제도적 구멍을 막을 대책이 슬슬 꺾이기 시작한 상황이라고 하는데. 여러분은 이 처벌 수위 납득이 가십니까?'

※ 모든 레퍼런스 공통 핵심 패턴:
- [기]: 구체적 수치(금액·횟수·퍼센트·인원수)와 인물명·기관명을 2개 이상 포함. 반드시 '~다고 함.'으로 마무리. 막연한 감성 표현만으로 채우는 것 절대 금지.
- [전]: '~상황이라고 하는데.' 마침표로 끊어 독립 문장으로 마무리.
- [결]: '여러분은 ...' 으로 시작하는 독립 의문문. [전] 다음 문장으로 배치.
- 기관명·단체명 뒤 영문 약자 괄호 표기 금지 — TTS가 어색하게 읽힘.

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

  // 격식체 종결어 금지 — script에 ~습니다/~입니다 포함 시 재시도 강제
  if (parsed.script && /습니다|입니다/.test(parsed.script)) {
    throw new Error('SCRIPT_FORMAL_ENDING');
  }

  // 의문형 종결어는 마지막 문장(comment_bait)에만 허용 — 앞 문장에 있으면 hook 혼입으로 간주
  if (parsed.script) {
    const sentences = parsed.script.split(/(?<=[.?!])\s+/);
    const bodyWithoutLast = sentences.slice(0, -1);
    const hasQuestionInBody = bodyWithoutLast.some(s => /니까|십니까/.test(s));
    if (hasQuestionInBody) {
      throw new Error('SCRIPT_QUESTION_OPENING');
    }
  }

  if (parsed.title) {
    parsed.title = stripTitleSpecialChars(parsed.title);
  }

  // 기승전결 구조 라벨이 출력에 포함된 경우 제거 — TTS/자막에 읽히지 않도록
  if (parsed.script) {
    parsed.script = parsed.script
      .replace(/\[[기승전결][^\]]*\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
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
      const isRetryable = status === 503 || msg.startsWith('SCRIPT_TOO_LONG') || msg === 'SCRIPT_FORMAL_ENDING' || msg === 'SCRIPT_QUESTION_OPENING';
      if (isRetryable && attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Gemini 최대 재시도 초과');
}
