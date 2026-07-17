# ── GitHub Actions OIDC 배포 역할 ────────────────────────────────────────────
#
# web 배포(ECR/EC2)와 worker 배포(Lambda/CloudFormation)를 모두 담당.
# OIDC Provider는 콘솔에서 수동 생성됨 (terraform state 외부).

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_actions_deploy" {
  name = "github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = data.aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:newgirok/youtube-shorts-automation:*"
        }
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "deploy-permissions"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ── ECR 공통 ───────────────────────────────────────────────────────────
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      # ── ECR 레포지토리 (web + render-worker) ───────────────────────────────
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
        ]
        Resource = [
          "arn:aws:ecr:ap-northeast-2:${data.aws_caller_identity.current.account_id}:repository/web",
          "arn:aws:ecr:ap-northeast-2:${data.aws_caller_identity.current.account_id}:repository/render-worker",
        ]
      },
      # ── SSM 파라미터 읽기 ─────────────────────────────────────────────────
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = "arn:aws:ssm:ap-northeast-2:${data.aws_caller_identity.current.account_id}:parameter/shorts.prod.*"
      },
      # ── EC2 (web 배포 시 인스턴스 IP 조회) ───────────────────────────────
      {
        Effect   = "Allow"
        Action   = ["ec2:DescribeInstances"]
        Resource = "*"
      },
      # ── CloudFormation (Serverless Framework 배포) ────────────────────────
      {
        Effect = "Allow"
        Action = [
          "cloudformation:CreateStack",
          "cloudformation:UpdateStack",
          "cloudformation:DeleteStack",
          "cloudformation:DescribeStacks",
          "cloudformation:DescribeStackEvents",
          "cloudformation:DescribeStackResource",
          "cloudformation:DescribeStackResources",
          "cloudformation:ListStackResources",
          "cloudformation:GetTemplate",
          "cloudformation:CreateChangeSet",
          "cloudformation:ExecuteChangeSet",
          "cloudformation:DeleteChangeSet",
          "cloudformation:DescribeChangeSet",
        ]
        Resource = "arn:aws:cloudformation:ap-northeast-2:${data.aws_caller_identity.current.account_id}:stack/shorts-*"
      },
      # ValidateTemplate은 스택 ARN 리소스 범위를 지원하지 않아 * 필요
      {
        Effect   = "Allow"
        Action   = ["cloudformation:ValidateTemplate"]
        Resource = "*"
      },
      # ── S3 (Serverless 배포 아티팩트 버킷) ───────────────────────────────
      {
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:DeleteBucket",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetEncryptionConfiguration",
          "s3:PutEncryptionConfiguration",
          "s3:GetBucketPolicy",
          "s3:PutBucketPolicy",
          "s3:PutBucketTagging",
          "s3:GetBucketTagging",
          "s3:PutBucketVersioning",
          "s3:GetBucketVersioning",
        ]
        Resource = [
          "arn:aws:s3:::shorts-*",
          "arn:aws:s3:::shorts-*/*",
        ]
      },
      # ── Lambda 함수 관련 ─────────────────────────────────────────────────
      {
        Effect = "Allow"
        Action = [
          "lambda:CreateFunction",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:DeleteFunction",
          "lambda:PublishVersion",
          "lambda:ListVersionsByFunction",
          "lambda:AddPermission",
          "lambda:RemovePermission",
          "lambda:GetPolicy",
          "lambda:TagResource",
          "lambda:UntagResource",
          "lambda:ListTags",
        ]
        Resource = "arn:aws:lambda:ap-northeast-2:${data.aws_caller_identity.current.account_id}:function:shorts-*"
      },
      # ── Lambda EventSourceMapping (SQS 트리거, UUID 기반 ARN) ─────────────
      {
        Effect = "Allow"
        Action = [
          "lambda:CreateEventSourceMapping",
          "lambda:UpdateEventSourceMapping",
          "lambda:DeleteEventSourceMapping",
          "lambda:GetEventSourceMapping",
          "lambda:ListEventSourceMappings",
          "lambda:TagResource",
          "lambda:UntagResource",
        ]
        Resource = "*"
      },
      # ── IAM PassRole (Lambda 실행 역할 전달) ──────────────────────────────
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/prod-LambdaWorkerRole"
      },
      # ── CloudWatch Logs (Lambda 로그 그룹 생성) ───────────────────────────
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:DeleteLogGroup",
          "logs:DescribeLogGroups",
          "logs:PutRetentionPolicy",
          "logs:TagResource",
          "logs:TagLogGroup",
        ]
        Resource = "arn:aws:logs:ap-northeast-2:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/shorts-*"
      },
      # ── SQS (EventSourceMapping 대상 큐 속성 조회) ────────────────────────
      {
        Effect   = "Allow"
        Action   = ["sqs:GetQueueAttributes", "sqs:GetQueueUrl", "sqs:ListQueues"]
        Resource = "*"
      },
    ]
  })
}
