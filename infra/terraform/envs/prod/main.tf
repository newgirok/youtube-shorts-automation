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

# web 앱 인바운드 허용 (80/443은 CLI로 추가, Terraform은 3001만 관리)
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

  lifecycle {
    ignore_changes = [ingress]
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

# ── EC2 Web Service ───────────────────────────────────────────────────────────

data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-kernel-*-x86_64"]
  }
}

resource "aws_iam_role" "ec2_web" {
  name = "prod-ec2-web-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ec2_web_ssm_core" {
  role       = aws_iam_role.ec2_web.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "ec2_web_custom" {
  name = "ec2-web-custom"
  role = aws_iam_role.ec2_web.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchCheckLayerAvailability",
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = "arn:aws:ssm:ap-northeast-2:${data.aws_caller_identity.current.account_id}:parameter/shorts.prod.*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_web" {
  name = "prod-ec2-web-profile"
  role = aws_iam_role.ec2_web.name
}

resource "aws_instance" "web" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = "t3.micro"
  key_name               = "prod-web"
  iam_instance_profile   = aws_iam_instance_profile.ec2_web.name
  vpc_security_group_ids = [aws_security_group.web.id]
  subnet_id              = tolist(data.aws_subnets.default.ids)[0]

  user_data = base64encode(file("${path.module}/ec2-web-init.sh"))

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  tags = { Name = "prod-web" }
}

resource "aws_eip" "web" {
  domain = "vpc"
  tags   = { Name = "prod-web-eip" }
}

resource "aws_eip_association" "web" {
  instance_id   = aws_instance.web.id
  allocation_id = aws_eip.web.id
}

output "web_public_ip" {
  value       = aws_eip.web.public_ip
  description = "Web 앱 고정 IP — NEXTAUTH_URL SSM 파라미터 업데이트 후 Google OAuth URI 등록 필요"
}
