# CLAUDE.md

**Always respond in Korean, regardless of the language used in the user's message.**

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. Playwright MCP 파일 저장 경로

`.mcp.json`에 `--output-dir .playwright-mcp`이 설정되어 있고, PostToolUse 훅(`.claude/playwright-sort.ps1`)이 도구 호출마다 파일을 자동 분류한다:
- `.playwright-mcp/*.yml` → `.playwright-mcp/snapshots/`
- `.playwright-mcp/*.png` → `.playwright-mcp/screenshots/`
- `.playwright-mcp/*.log` → `.playwright-mcp/logs/`

`browser_take_screenshot` 또는 `browser_snapshot` 호출 시 `filename` 파라미터를 지정하면 해당 경로에 저장되고, 훅이 자동으로 올바른 서브폴더로 이동한다. 명시적 경로가 없으면 `.playwright-mcp/` 루트에 저장 후 훅이 분류한다.

## 6. 프로젝트 핵심 사실 (코드 기준)

### 콘텐츠 방향
- **한국 뉴스·시사 쇼츠 특화** (어필리에이트 방향 아님)
- 스크립트 길이: 25~35초 (180~250자), 강한 구어체
- `comment_bait` 질문으로 반드시 마무리

### AI 모델
- `gemini-2.5-flash` (변경 금지)

### 자막 생성 방식
- **faster-whisper 없음** — `script.json`의 `script` 필드로 직접 SRT 생성
- `ffprobe`로 오디오 길이 측정 → 문자 수 비례 타임스탬프 → 시사 키워드(빨간) + 숫자(노란) 하이라이트

### 영상 렌더링
- Pexels API로 `scenes[].keyword` 기반 배경 이미지 다운로드
- zoompan 효과: `zoom-in`, `zoom-out`, `pan-left`, `pan-right`
- FontSize=46, Bold=1, Outline=8 (affiliate CTA 자막 없음)

### YouTube 업로드 메타데이터
- `categoryId: '25'` (뉴스·정치)
- `containsSyntheticMedia: true`
- AI 공시 문구 description 포함

### DB 스키마 현재 상태 (schema.prisma 기준)
- `Job.privacyStatus: String @default("public")`
- `Job.viewCount / likeCount: BigInt`
- `Channel.totalViews: BigInt`
- `ChannelAnalytics.watchTimeMinutes: BigInt`
- `Channel.affiliateUrl: String?` (필드는 존재하지만 render-worker에서 CTA는 사용 안 함)
- `lastSyncedAt` 필드 없음 (PRD 구버전 오기재)

### 새 API 엔드포인트 (Phase 2 완료)
- `POST /jobs/auto-news` — Google News RSS 수집 + Job 일괄 생성
- `POST /channels/:id/sync` — YouTube Data API + Analytics API 풀 동기화
- `POST /channels/:id/sync-videos` — 영상 통계 + 삭제 영상 처리
- OAuth 스코프에 `yt-analytics.readonly` 포함

### 모든 패키지 ESM
- `tsconfig.base.json`: `module: "NodeNext"`, `moduleResolution: "NodeNext"`
- import 경로에 `.js` 확장자 필수
