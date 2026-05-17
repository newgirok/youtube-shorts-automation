terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws"; version = "~> 5.0" }
  }
}

provider "aws" { region = "ap-northeast-2" }

module "script_queue"   { source = "../../modules/sqs-queue"; queue_name = "prod-script-queue";   visibility_timeout = 120 }
module "tts_queue"      { source = "../../modules/sqs-queue"; queue_name = "prod-tts-queue";      visibility_timeout = 240 }
module "subtitle_queue" { source = "../../modules/sqs-queue"; queue_name = "prod-subtitle-queue"; visibility_timeout = 600 }
module "render_queue"   { source = "../../modules/sqs-queue"; queue_name = "prod-render-queue";   visibility_timeout = 1200 }
module "upload_queue"   { source = "../../modules/sqs-queue"; queue_name = "prod-upload-queue";   visibility_timeout = 600 }
