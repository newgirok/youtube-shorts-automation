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
  queue_name         = "prod-script-queue"
  visibility_timeout = 120
}

module "tts_queue" {
  source             = "../../modules/sqs-queue"
  queue_name         = "prod-tts-queue"
  visibility_timeout = 240
}

module "subtitle_queue" {
  source             = "../../modules/sqs-queue"
  queue_name         = "prod-subtitle-queue"
  visibility_timeout = 600
}

module "render_queue" {
  source             = "../../modules/sqs-queue"
  queue_name         = "prod-render-queue"
  visibility_timeout = 1200
}

module "upload_queue" {
  source             = "../../modules/sqs-queue"
  queue_name         = "prod-upload-queue"
  visibility_timeout = 600
}

# ── S3 ────────────────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

module "s3" {
  source      = "../../modules/s3-bucket"
  bucket_name = "jobs-prod-${data.aws_caller_identity.current.account_id}"
}

# ── IAM ───────────────────────────────────────────────────────────────────────

module "iam" {
  source     = "../../modules/iam"
  env        = "prod"
  bucket_arn = module.s3.bucket_arn
}

# ── ECR ───────────────────────────────────────────────────────────────────────

module "ecr_subtitle" {
  source = "../../modules/ecr-repo"
  name   = "subtitle-worker"
}

module "ecr_render" {
  source = "../../modules/ecr-repo"
  name   = "render-worker"
}

module "ecr_web" {
  source = "../../modules/ecr-repo"
  name   = "web"
}

# ── ECS Cluster ───────────────────────────────────────────────────────────────

module "ecs_cluster" {
  source       = "../../modules/ecs-cluster"
  cluster_name = "prod-shorts"
}

# ── Security Groups ───────────────────────────────────────────────────────────

# web 앱 인바운드 허용 (포트 3001)
resource "aws_security_group" "web" {
  name        = "prod-web-sg"
  description = "Web app inbound 3001"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "fargate_worker" {
  name        = "prod-fargate-worker-sg"
  description = "Fargate worker outbound only"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ── ECS Workers ───────────────────────────────────────────────────────────────

module "subtitle_worker" {
  source = "../../modules/ecs-worker"

  worker_name              = "subtitle"
  image_uri                = "${module.ecr_subtitle.repository_url}:latest"
  queue_url                = module.subtitle_queue.url
  queue_name               = "prod-subtitle-queue"
  cpu                      = 2048
  memory                   = 8192
  cluster_arn              = module.ecs_cluster.cluster_arn
  cluster_name             = module.ecs_cluster.cluster_name
  subnet_ids               = data.aws_subnets.default.ids
  security_group_id        = aws_security_group.fargate_worker.id
  task_execution_role_arn  = module.iam.fargate_task_execution_role_arn
  task_role_arn            = module.iam.fargate_task_role_arn
}

module "render_worker" {
  source = "../../modules/ecs-worker"

  worker_name              = "render"
  image_uri                = "${module.ecr_render.repository_url}:latest"
  queue_url                = module.render_queue.url
  queue_name               = "prod-render-queue"
  cpu                      = 4096
  memory                   = 16384
  cluster_arn              = module.ecs_cluster.cluster_arn
  cluster_name             = module.ecs_cluster.cluster_name
  subnet_ids               = data.aws_subnets.default.ids
  security_group_id        = aws_security_group.fargate_worker.id
  task_execution_role_arn  = module.iam.fargate_task_execution_role_arn
  task_role_arn            = module.iam.fargate_task_role_arn
}

# ── ECS Web Service ───────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/web"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "web" {
  family                   = "web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = module.iam.fargate_task_execution_role_arn
  task_role_arn            = module.iam.fargate_task_role_arn

  container_definitions = jsonencode([{
    name  = "web"
    image = "${module.ecr_web.repository_url}:latest"
    portMappings = [{ containerPort = 3001, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT",     value = "3001" },
    ]
    secrets = [
      { name = "AUTH_SECRET",        valueFrom = "arn:aws:ssm:ap-northeast-2:682251233572:parameter/shorts.prod.AUTH_SECRET" },
      { name = "NEXTAUTH_SECRET",    valueFrom = "arn:aws:ssm:ap-northeast-2:682251233572:parameter/shorts.prod.AUTH_SECRET" },
      { name = "NEXTAUTH_URL",       valueFrom = "arn:aws:ssm:ap-northeast-2:682251233572:parameter/shorts.prod.NEXTAUTH_URL" },
      { name = "AUTH_URL",           valueFrom = "arn:aws:ssm:ap-northeast-2:682251233572:parameter/shorts.prod.NEXTAUTH_URL" },
      { name = "GOOGLE_CLIENT_ID",   valueFrom = "arn:aws:ssm:ap-northeast-2:682251233572:parameter/shorts.prod.YOUTUBE_CLIENT_ID" },
      { name = "GOOGLE_CLIENT_SECRET", valueFrom = "arn:aws:ssm:ap-northeast-2:682251233572:parameter/shorts.prod.YOUTUBE_CLIENT_SECRET" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/web"
        "awslogs-region"        = "ap-northeast-2"
        "awslogs-stream-prefix" = "ecs"
      }
    }
    essential = true
  }])
}

resource "aws_ecs_service" "web" {
  name            = "web"
  cluster         = module.ecs_cluster.cluster_arn
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.web.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}
