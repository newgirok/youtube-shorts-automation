# youtube-shorts-automation

**Always respond in Korean, regardless of the language used in the user's message.**

## 프로젝트 핵심 사실

- **한국 뉴스·시사 쇼츠 특화**, 25~35초, 강한 구어체, `comment_bait` 마무리
- AI 모델: `gemini-2.5-flash` (**변경 금지**)
- 자막: `script.json`의 `script` 필드 → 직접 SRT 생성 (faster-whisper 없음)
- 렌더링: Pexels + zoompan (FontSize=46, affiliate CTA 없음)
- YouTube: `categoryId: '25'`, `containsSyntheticMedia: true`
- description 형식: `{Gemini 생성 본문 설명}\n\n{해시태그}` (AI 공시 텍스트 없음, API 플래그로 대체)
- 모든 패키지 ESM — import 경로에 `.js` 확장자 필수

## Playwright MCP 파일 저장 경로

`.mcp.json`에 `--output-dir .playwright-mcp`이 설정되어 있고, PostToolUse 훅(`.claude/playwright-sort.ps1`)이 도구 호출마다 파일을 자동 분류한다:
- `.playwright-mcp/*.yml` → `.playwright-mcp/snapshots/`
- `.playwright-mcp/*.png` → `.playwright-mcp/screenshots/`
- `.playwright-mcp/*.log` → `.playwright-mcp/logs/`

`browser_take_screenshot` 또는 `browser_snapshot` 호출 시 `filename` 파라미터를 지정하면 해당 경로에 저장되고, 훅이 자동으로 올바른 서브폴더로 이동한다.

## 앱별 상세 가이드

- `apps/api/CLAUDE.md` — NestJS API 엔드포인트, 모듈 구조
- `apps/web/CLAUDE.md` — Next.js 대시보드, 컴포넌트 구조, 폴링 규칙
- `apps/workers/CLAUDE.md` — Worker 공통 패턴, 실행 환경 요약
- `packages/shared/CLAUDE.md` — 공통 모듈 구조, Prisma 싱글턴, S3 유틸

## 코딩 규칙 위치

세부 코딩 규칙은 `.claude/rules/`에 도메인별로 분리되어 있다.
편집 컨텍스트에 따라 관련 규칙 파일을 Read 도구로 읽고 적용할 것:

| 파일 | 적용 컨텍스트 |
|---|---|
| `typescript.md` | 모든 패키지 |
| `security.md` | 모든 패키지 |
| `nestjs-api.md` | `apps/api` |
| `database.md` | `apps/api`, `packages/shared`, `apps/workers/*` |
| `worker-pipeline.md` | `apps/workers/*` |
| `frontend.md` | `apps/web` |
| `infrastructure.md` | `infra/`, `docker/`, `.github/` |

코드 리뷰 기준: `.claude/REVIEW.md`
