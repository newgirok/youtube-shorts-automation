terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = "ap-northeast-2" }

# ── Network (Default VPC) ─────────────────────────────────────────────────────

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ── SQS Queues (+ DLQ) ───────────────────────────────────────────────────────

module "script_queue" {
  source             = "../../modules/sqs-queue"
  queue_name         = "dev-script-queue"
  visibility_timeout = 120
}

module "tts_queue" {
  source             = "../../modules/sqs-queue"
  queue_name         = "dev-tts-queue"
  visibility_timeout = 240
}

module "subtitle_queue" {
  source             = "../../modules/sqs-queue"
  queue_name         = "dev-subtitle-queue"
  visibility_timeout = 600
}

module "render_queue" {
  source             = "../../modules/sqs-queue"
  queue_name         = "dev-render-queue"
  visibility_timeout = 1200
}

module "upload_queue" {
  source             = "../../modules/sqs-queue"
  queue_name         = "dev-upload-queue"
  visibility_timeout = 600
}

# ── S3 ────────────────────────────────────────────────────────────────────────

module "s3" {
  source      = "../../modules/s3-bucket"
  bucket_name = "jobs-dev"
}

# ── IAM ───────────────────────────────────────────────────────────────────────

module "iam" {
  source     = "../../modules/iam"
  env        = "dev"
  bucket_arn = module.s3.bucket_arn
}

# ── ECR ───────────────────────────────────────────────────────────────────────

module "ecr_render" {
  source               = "../../modules/ecr-repo"
  name                 = "dev-render-worker"
  image_tag_mutability = "MUTABLE"
}
