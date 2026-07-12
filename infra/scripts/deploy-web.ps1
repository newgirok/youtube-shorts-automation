# web 앱 빌드 및 ECR 배포 스크립트
# 실행: ! .\infra\scripts\deploy-web.ps1
#
# 주의: 프로젝트 루트에서 실행해야 합니다.
# 사전 조건: Docker 실행 중, AWS CLI 로그인 완료

$ErrorActionPreference = "Stop"

$REGION = "ap-northeast-2"
$ACCOUNT_ID = "682251233572"
$ECR_REGISTRY = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
$ECR_REPO = "web"
$ECS_CLUSTER = "prod-shorts"
$ECS_SERVICE = "web"

Write-Host "[1/4] SSM에서 빌드 파라미터 로드 중..."
$NEXT_PUBLIC_API_URL = (aws ssm get-parameter --name "shorts.prod.NEXT_PUBLIC_API_URL" --query "Parameter.Value" --output text --region $REGION)
$NEXT_PUBLIC_API_SECRET = (aws ssm get-parameter --name "shorts.prod.NEXT_PUBLIC_API_SECRET" --with-decryption --query "Parameter.Value" --output text --region $REGION)
Write-Host "  → API URL: $NEXT_PUBLIC_API_URL"

Write-Host "[2/4] ECR 로그인 중..."
$token = (aws ecr get-authorization-token --region $REGION --query "authorizationData[0].authorizationToken" --output text)
$decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($token))
$pass = $decoded.Split(':')[1]
docker login --username AWS --password $pass $ECR_REGISTRY

Write-Host "[3/4] Docker 이미지 빌드 중..."
docker build `
  --build-arg NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" `
  --build-arg NEXT_PUBLIC_API_SECRET="$NEXT_PUBLIC_API_SECRET" `
  -f apps/web/Dockerfile `
  -t "${ECR_REGISTRY}/${ECR_REPO}:latest" `
  .

Write-Host "[4/4] ECR 푸시 및 ECS 업데이트..."
docker push "${ECR_REGISTRY}/${ECR_REPO}:latest"
aws ecs update-service --cluster $ECS_CLUSTER --service $ECS_SERVICE --force-new-deployment --region $REGION | Out-Null
Write-Host "  → ECS 서비스 업데이트 완료"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "배포 완료. ECS 태스크 시작 후 Public IP 확인:"
Write-Host ""
Write-Host "aws ecs list-tasks --cluster $ECS_CLUSTER --service-name $ECS_SERVICE --region $REGION"
Write-Host "aws ecs describe-tasks --cluster $ECS_CLUSTER --tasks <TASK_ARN> --region $REGION --query 'tasks[0].attachments[0].details'"
Write-Host ""
Write-Host "Public IP 확인 후 NEXTAUTH_URL을 SSM에 업데이트하세요:"
Write-Host "aws ssm put-parameter --name 'shorts.prod.NEXTAUTH_URL' --value 'http://<PUBLIC_IP>:3001' --type String --overwrite --region $REGION"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
