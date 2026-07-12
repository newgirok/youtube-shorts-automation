# Lambda Layer 빌드 스크립트
# 실행: cd infra/lambda-layers && ./build-layers.ps1
#
# edge-tts Layer는 tts-worker가 msedge-tts npm 패키지로 교체된 이후 불필요.
# upload-worker의 ffprobe Layer만 빌드한다.

$ErrorActionPreference = "Stop"
$REGION = "ap-northeast-2"
$ACCOUNT_ID = "682251233572"
$ROOT = Join-Path $PSScriptRoot ".."  # infra/

# ── ffprobe Layer ────────────────────────────────────────────────────────────

Write-Host "[1/1] ffprobe Lambda Layer 빌드 중..."

$FFPROBE_BUILD = Join-Path $PSScriptRoot "ffprobe-build"
New-Item -ItemType Directory -Force -Path "$FFPROBE_BUILD/bin" | Out-Null

# Docker로 정적 ffprobe 바이너리 추출 (Amazon Linux 2023 호환)
docker run --rm `
  -v "${FFPROBE_BUILD}/bin:/output" `
  debian:12-slim `
  /bin/sh -c "apt-get update -q && apt-get install -y -q ffmpeg && cp /usr/bin/ffprobe /output/ffprobe && chmod +x /output/ffprobe"

$FFPROBE_SIZE = (Get-Item "$FFPROBE_BUILD/bin/ffprobe").Length / 1MB
Write-Host "  → ffprobe 바이너리: $([math]::Round($FFPROBE_SIZE, 1)) MB"

# Layer zip 생성
Push-Location $FFPROBE_BUILD
if (Test-Path "../ffprobe-layer.zip") { Remove-Item "../ffprobe-layer.zip" }
Compress-Archive -Path "bin" -DestinationPath "../ffprobe-layer.zip" -Force
Pop-Location

$FFPROBE_ZIP = Join-Path $PSScriptRoot "ffprobe-layer.zip"
$FFPROBE_OUTPUT = aws lambda publish-layer-version `
  --layer-name "prod-ffprobe" `
  --description "Static ffprobe binary for Lambda" `
  --zip-file "fileb://$FFPROBE_ZIP" `
  --compatible-runtimes nodejs22.x `
  --region $REGION `
  --output json | ConvertFrom-Json

$FFPROBE_ARN = $FFPROBE_OUTPUT.LayerVersionArn
Write-Host "  → ffprobe Layer ARN: $FFPROBE_ARN"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "Lambda Layer 빌드 완료"
Write-Host "다음 ARN을 apps/workers/upload/serverless.yml 에 기입하세요:"
Write-Host ""
Write-Host "ffprobe: $FFPROBE_ARN"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
