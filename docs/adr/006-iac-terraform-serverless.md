# ADR 006: IaC 도구 분리 — Terraform + Serverless Framework

**상태:** Accepted

## 배경

인프라 프로비저닝과 Lambda 함수 배포를 하나의 도구로 통일할지, 역할별로 분리할지 결정이 필요했다. 후보: Terraform, AWS CDK, CloudFormation, Serverless Framework.

## 결정

**역할에 따라 두 도구를 분리 사용**

| 도구 | 담당 범위 | 위치 |
|---|---|---|
| Terraform | S3, SQS, IAM, ECR, EventBridge, Budget | `infra/*.tf` |
| Serverless Framework v3 | Lambda 함수 배포, SQS 트리거, esbuild 번들링 | 각 Worker `serverless.yml` |

**Terraform을 인프라에 선택한 이유:**
- S3·SQS·IAM 같은 장수명(long-lived) 공유 리소스에 적합
- `terraform state`로 리소스 드리프트 감지 가능
- CDK는 TypeScript 컴파일 단계가 추가되고 디버깅이 복잡함
- CloudFormation 직접 작성은 YAML 장황도가 높음

**Serverless Framework를 Lambda에 선택한 이유:**
- `individually: true` + esbuild 번들링 — Lambda ZIP 최소화
- SQS 트리거 연결이 `serverless.yml` 10줄로 완결
- `serverless deploy --stage prod` 한 줄로 함수 코드 + 트리거 동시 배포
- Terraform으로 Lambda를 관리하면 ZIP 업로드·버전 관리 로직을 직접 작성해야 함

## 결과

- 인프라(Terraform)와 코드(Serverless) 배포 사이클이 분리됨 — 코드만 바꿀 때 `terraform apply` 불필요
- SQS 큐 URL 등 Terraform output → `serverless.yml` 환경변수로 참조
- IaC 도구를 CDK로 통일하려면 Terraform state 마이그레이션 비용 발생 — 변경 금지
