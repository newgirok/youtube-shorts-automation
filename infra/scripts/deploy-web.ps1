# web 앱 빌드 및 ECR 배포 스크립트 (EC2 + Docker Compose 방식)
# 실행: ! .\infra\scripts\deploy-web.ps1
#
# 사전 조건: Docker 실행 중, AWS CLI 로그인 완료, EC2 인스턴스(tag:Name=prod-web) 실행 중

$ErrorActionPreference = "Stop"

$REGION = "ap-northeast-2"
$ACCOUNT_ID = "682251233572"
$ECR_REGISTRY = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
$ECR_REPO = "web"

Write-Host "[1/4] SSM에서 빌드 파라미터 로드 중..."
$NEXT_PUBLIC_API_URL = (aws ssm get-parameter --name "shorts.prod.NEXT_PUBLIC_API_URL" --query "Parameter.Value" --output text --region $REGION)
$NEXT_PUBLIC_API_SECRET = (aws ssm get-parameter --name "shorts.prod.NEXT_PUBLIC_API_SECRET" --with-decryption --query "Parameter.Value" --output text --region $REGION)
Write-Host "  → API URL: $NEXT_PUBLIC_API_URL"

Write-Host "[2/4] ECR 로그인 중..."
$token = (aws ecr get-authorization-token --region $REGION --query "authorizationData[0].authorizationToken" --output text)
$decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($token))
$pass = $decoded.Split(':')[1]
docker login --username AWS --password $pass $ECR_REGISTRY

Write-Host "[3/4] Docker 이미지 빌드 및 ECR 푸시 중..."
docker build `
  --build-arg NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" `
  --build-arg NEXT_PUBLIC_API_SECRET="$NEXT_PUBLIC_API_SECRET" `
  -f apps/web/Dockerfile `
  -t "${ECR_REGISTRY}/${ECR_REPO}:latest" `
  .

docker push "${ECR_REGISTRY}/${ECR_REPO}:latest"

Write-Host "[4/4] EC2에서 Docker Compose 재시작 중..."
$INSTANCE_ID = (aws ec2 describe-instances `
  --filters "Name=tag:Name,Values=prod-web" "Name=instance-state-name,Values=running" `
  --query "Reservations[0].Instances[0].InstanceId" `
  --output text `
  --region $REGION)

if (-not $INSTANCE_ID -or $INSTANCE_ID -eq "None") {
  Write-Host "  [경고] EC2 인스턴스(prod-web)를 찾을 수 없습니다. 이미지만 푸시됐습니다."
  exit 0
}

Write-Host "  → 인스턴스: $INSTANCE_ID"

# SSH로 docker compose pull + up (새 이미지 반영)
$KEY = "$HOME\prod-ssh\prod-web.pem"
$PUBLIC_IP = (aws ec2 describe-instances `
  --instance-ids $INSTANCE_ID `
  --query "Reservations[0].Instances[0].PublicIpAddress" `
  --output text `
  --region $REGION)

ssh -i $KEY -o StrictHostKeyChecking=no ec2-user@$PUBLIC_IP `
  "cd /home/ec2-user/app && sudo docker compose pull && sudo docker compose up -d"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "배포 완료."
Write-Host "Web URL: https://shorts-kit.com"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
