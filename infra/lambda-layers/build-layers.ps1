# Lambda Layer 빌드 스크립트
# 실행: cd infra/lambda-layers && ./build-layers.ps1

$ErrorActionPreference = "Stop"
$REGION = "ap-northeast-2"
$ACCOUNT_ID = "682251233572"
$ROOT = Join-Path $PSScriptRoot ".."  # infra/

# ── edge-tts Layer ──────────────────────────────────────────────────────────

Write-Host "[1/3] edge-tts Lambda Layer 빌드 중..."

$EDGE_TTS_BUILD = Join-Path $PSScriptRoot "edge-tts-build"
New-Item -ItemType Directory -Force -Path "$EDGE_TTS_BUILD/bin" | Out-Null
New-Item -ItemType Directory -Force -Path "$EDGE_TTS_BUILD/edge-tts-deps" | Out-Null

# Docker로 Amazon Linux 2023 환경에서 pip install
docker run --rm `
  -v "${EDGE_TTS_BUILD}:/build" `
  python:3.12-slim `
  /bin/sh -c "pip install edge-tts -t /build/edge-tts-deps --no-compile -q && find /build/edge-tts-deps -name '*.pyc' -delete"

# wrapper script 생성
@"
#!/bin/bash
export PYTHONPATH=/opt/edge-tts-deps:`${PYTHONPATH:-}
exec /usr/bin/python3 -m edge_tts "`$@"
"@ | Set-Content -Path "$EDGE_TTS_BUILD/bin/edge-tts" -Encoding UTF8 -NoNewline

# Layer zip 생성
Push-Location $EDGE_TTS_BUILD
if (Test-Path "../edge-tts-layer.zip") { Remove-Item "../edge-tts-layer.zip" }
Compress-Archive -Path "bin", "edge-tts-deps" -DestinationPath "../edge-tts-layer.zip" -Force
Pop-Location

Write-Host "[2/3] edge-tts Layer AWS 업로드 중..."
$EDGE_TTS_ZIP = Join-Path $PSScriptRoot "edge-tts-layer.zip"
$LAYER_OUTPUT = aws lambda publish-layer-version `
  --layer-name "prod-edge-tts" `
  --description "edge-tts Python TTS for Lambda" `
  --zip-file "fileb://$EDGE_TTS_ZIP" `
  --compatible-runtimes nodejs22.x `
  --region $REGION `
  --output json | ConvertFrom-Json

$EDGE_TTS_ARN = $LAYER_OUTPUT.LayerVersionArn
Write-Host "  → edge-tts Layer ARN: $EDGE_TTS_ARN"

# ── ffprobe Layer ────────────────────────────────────────────────────────────

Write-Host "[3/3] ffprobe Lambda Layer 빌드 중..."

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
Write-Host "다음 ARN을 apps/workers/tts/serverless.yml 과 apps/workers/upload/serverless.yml 에 기입하세요:"
Write-Host ""
Write-Host "edge-tts: $EDGE_TTS_ARN"
Write-Host "ffprobe:  $FFPROBE_ARN"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
