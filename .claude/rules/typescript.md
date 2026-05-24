# TypeScript 코딩 규칙

## 기본 설정
- `strict: true` 필수 — tsconfig.base.json 기준
- `any` 타입 사용 절대 금지 — 타입 추론 또는 제네릭으로 대체
- 타입 단언(`as`) 대신 `satisfies` 연산자 사용
- 공통 타입은 `packages/shared/src/types.ts`에서만 정의하고 import

## ESM 모듈 규칙
- 모든 패키지 `"type": "module"` (ESM)
- import 경로에 반드시 `.js` 확장자 명시:
  ```typescript
  //  올바름
  import { prisma } from './db.js';
  import type { Job } from '@shorts/shared/types.js';

  //  금지
  import { prisma } from './db';
  ```
- `tsconfig.base.json`: `module: "NodeNext"`, `moduleResolution: "NodeNext"`

## 타입 정의 원칙
- 함수 반환 타입 명시 권장 (추론 불가한 경우 필수)
- `interface` vs `type`: 확장 가능성이 있으면 `interface`, 유니온/인터섹션은 `type`
- Zod 스키마가 있으면 `z.infer<typeof Schema>`로 타입 파생

## 금지 패턴
```typescript
//  any 금지
const data: any = response.json();

//  타입 단언 남용 금지
const user = data as User;

//  satisfies 사용
const config = {
  model: 'gemini-2.5-flash',
  maxTokens: 1024,
} satisfies GeminiConfig;

//  타입 가드 사용
function isScriptOutput(data: unknown): data is ScriptOutput {
  return typeof data === 'object' && data !== null && 'title' in data;
}
```
