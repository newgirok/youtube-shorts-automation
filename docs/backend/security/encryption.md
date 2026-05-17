# 암호화 규격 — refreshToken AES-256-GCM

> 관련 문서: [환경변수 가이드](../../onboarding/env-vars.md) · [YouTube OAuth 설정](../../onboarding/api-keys.md)

---

## 개요

이 프로젝트는 사용자의 YouTube OAuth2 `refresh_token`을 DB에 저장할 때 **AES-256-GCM** 으로 암호화한다.  
암호화 키는 환경변수 `ENCRYPTION_KEY`로 주입하며, 로컬에서는 `.env.local`, 프로덕션에서는 AWS Secrets Manager에서 가져온다.

---

## 1. 알고리즘 선택 이유 — AES-256-GCM

| 항목 | AES-256-GCM | AES-256-CBC |
|---|---|---|
| 인증(변조 감지) | 내장 (authTag) | 별도 HMAC 필요 |
| 패딩 오라클 공격 | 없음 | 취약 가능성 있음 |
| 표준 권장 여부 | NIST 권장 | 레거시 |
| 구현 복잡도 | 낮음 (Node.js crypto 내장) | 중간 |

**GCM(Galois/Counter Mode)** 은 암호화와 인증을 동시에 제공한다.  
`authTag` 16바이트가 데이터 변조를 감지하므로, 복호화 시점에 키가 맞더라도 저장된 값이 변조되면 오류가 발생한다.  
이는 CBC 모드에서 별도 HMAC 없이 발생할 수 있는 변조 무감지 문제를 원천 차단한다.

---

## 2. DB 저장 포맷

```
{iv_hex}:{authTag_hex}:{encrypted_hex}
```

예시:
```
a1b2c3d4e5f6a7b8c9d0e1f2:f0e1d2c3b4a5f6e7d8c9b0a1:4d7a9c3e2f1b8a6d5c4e3f2a1b0c9d8e
```

| 부분 | 바이트 | 설명 |
|---|---|---|
| `iv_hex` | 12바이트 → 24자리 hex | 초기화 벡터. 매 암호화마다 새로 생성하는 난수. 재사용 금지. |
| `authTag_hex` | 16바이트 → 32자리 hex | GCM 인증 태그. 복호화 시 변조 감지에 사용. |
| `encrypted_hex` | 가변 | 암호화된 본문 (refresh_token 원문). |

### IV 재사용이 금지되는 이유

GCM에서 동일한 키로 동일한 IV를 두 번 사용하면 공격자가 암호화된 두 메시지를 XOR해  
키스트림(keystream)을 복원할 수 있다. 이는 AES-256-GCM의 보안 전제를 완전히 파괴한다.  
**매 암호화 호출 시 `crypto.randomBytes(12)`로 새 IV를 생성해야 한다.**

---

## 3. 키 생성 방법

`ENCRYPTION_KEY`는 **64자리 hex 문자열 (= 32 bytes = 256 bit)** 이어야 한다.  
짧거나 길면 AES-256 초기화 시 `Invalid key length` 오류가 발생한다.

### 방법 1 — Node.js (권장)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

출력 예시:
```
a3f1c2d4e5b6a7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

### 방법 2 — OpenSSL

```bash
openssl rand -hex 32
```

### 방법 3 — PowerShell (Windows)

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

---

## 4. 로컬 설정 방법

프로젝트 루트의 `.env.local`에 추가한다.  
이 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않는다.

```bash
ENCRYPTION_KEY=a3f1c2d4e5b6a7f8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

설정 후 API 서버와 upload-worker를 재시작하면 적용된다.

---

## 5. 프로덕션 설정 방법

프로덕션에서는 환경 파일 직접 작성을 금지한다.  
`ENCRYPTION_KEY`는 반드시 **AWS Secrets Manager**에 저장하고, Lambda/Fargate 실행 시 주입한다.

### Secrets Manager에 저장

```bash
aws secretsmanager create-secret \
  --name "youtube-shorts/encryption-key" \
  --secret-string "a3f1c2d4..."
```

### Terraform/IaC에서 주입

Lambda 환경변수나 ECS Task Definition에서 Secrets Manager 참조로 주입한다.  
코드나 `.env` 파일에 실제 키 값을 하드코딩하는 것은 보안 위반이다.

---

## 6. 암호화/복호화 구현 예시

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 매 호출마다 새 IV 생성
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(stored: string): string {
  const [ivHex, authTagHex, encryptedHex] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
  // authTag 불일치 시 여기서 예외 발생 → 변조 감지
}
```

---

## 7. `access_token` 저장 금지 정책

**`access_token`은 어떤 변수명으로도 DB에 저장하지 않는다.**

이유:
- `access_token`의 유효기간은 1시간이다. DB에 저장해도 금방 만료된다.
- 만료된 `access_token`이 DB에 남아 있으면 유출 시 짧은 시간이지만 공격에 악용될 수 있다.
- `refresh_token`으로 언제든지 새 `access_token`을 발급할 수 있다.

**올바른 패턴:**

```typescript
// OAuth2Client를 통해 런타임에서 access_token 재발급
const oauth2Client = new OAuth2Client(clientId, clientSecret);
oauth2Client.setCredentials({ refresh_token: decryptedRefreshToken });
const { token: accessToken } = await oauth2Client.getAccessToken();
// accessToken은 메모리에서만 사용하고 절대 DB에 저장하지 않는다
```

---

## 8. 주의사항

### 키 분실 시

`ENCRYPTION_KEY`를 분실하면 DB에 저장된 모든 `Channel.refreshToken`을 복호화할 수 없다.  
복구 방법은 없으며, 각 채널의 OAuth2 인증을 처음부터 다시 진행해야 한다 ([YouTube OAuth 설정](../../runbook/youtube-api-setup.md) 참고).

**백업 방법:** Secrets Manager의 버전 관리 기능을 사용하거나, 별도 보안 저장소에 키를 백업한다.

### 키 교체 시

키를 교체하면 기존 키로 암호화된 데이터를 새 키로 복호화할 수 없다.  
키 교체 절차:

1. 기존 키(`ENCRYPTION_KEY_OLD`)와 새 키(`ENCRYPTION_KEY`)를 동시에 환경에 주입한다.
2. 마이그레이션 스크립트를 실행해 모든 `Channel.refreshToken`을 기존 키로 복호화 후 새 키로 재암호화한다.
3. 마이그레이션 완료 후 `ENCRYPTION_KEY_OLD`를 제거한다.

### IV 재사용 방지

위의 구현 예시처럼 `randomBytes(12)`로 매 암호화마다 새 IV를 생성한다.  
카운터, 타임스탬프 기반 IV, 고정 IV는 절대 사용하지 않는다.

### 환경변수 길이 검증

앱 시작 시 Zod 스키마에서 `ENCRYPTION_KEY`의 길이가 64자인지 검증한다.

```typescript
ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY는 64자리 hex 문자열이어야 합니다'),
```
