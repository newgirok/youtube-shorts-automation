#!/bin/bash
set -e

export AWS_DEFAULT_REGION=ap-northeast-2

echo "LocalStack 초기화 시작..."

# S3 버킷 생성
awslocal s3 mb s3://jobs-local

# SQS 큐 생성 (DLQ 먼저)
awslocal sqs create-queue --queue-name script-dlq
awslocal sqs create-queue --queue-name tts-dlq
awslocal sqs create-queue --queue-name subtitle-dlq
awslocal sqs create-queue --queue-name render-dlq
awslocal sqs create-queue --queue-name upload-dlq

# 본 큐 생성 (DLQ ARN 참조)
SCRIPT_DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/script-dlq --attribute-names QueueArn --query Attributes.QueueArn --output text)
TTS_DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/tts-dlq --attribute-names QueueArn --query Attributes.QueueArn --output text)
SUBTITLE_DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/subtitle-dlq --attribute-names QueueArn --query Attributes.QueueArn --output text)
RENDER_DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/render-dlq --attribute-names QueueArn --query Attributes.QueueArn --output text)
UPLOAD_DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/upload-dlq --attribute-names QueueArn --query Attributes.QueueArn --output text)

awslocal sqs create-queue --queue-name script-queue --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$SCRIPT_DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"
awslocal sqs create-queue --queue-name tts-queue --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$TTS_DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"
awslocal sqs create-queue --queue-name subtitle-queue --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$SUBTITLE_DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"
awslocal sqs create-queue --queue-name render-queue --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$RENDER_DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"
awslocal sqs create-queue --queue-name upload-queue --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$UPLOAD_DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

echo "LocalStack 초기화 완료!"
echo "S3: s3://jobs-local"
echo "SQS: script-queue, tts-queue, subtitle-queue, render-queue, upload-queue"
