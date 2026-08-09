# ── Lambda Worker Role ────────────────────────────────────────────────────────

resource "aws_iam_role" "lambda_worker" {
  name = "${var.env}-LambdaWorkerRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_inline" {
  name = "lambda-worker-inline"
  role = aws_iam_role.lambda_worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:SendMessage",
        ]
        Resource = "arn:aws:sqs:ap-northeast-2:${var.account_id}:${var.env}-*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
        ]
        Resource = "${var.bucket_arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = "arn:aws:ssm:ap-northeast-2:${var.account_id}:parameter/shorts.${var.env}.*"
      },
      {
        # API가 채널별로 EventBridge 규칙을 동적 생성하므로 Resource = "*" 불가피
        Effect = "Allow"
        Action = [
          "events:PutRule",
          "events:PutTargets",
          "events:RemoveTargets",
          "events:DeleteRule",
          "events:DescribeRule",
        ]
        Resource = "arn:aws:events:ap-northeast-2:${var.account_id}:rule/*"
      },
    ]
  })
}

