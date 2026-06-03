output "lambda_role_arn"                  { value = aws_iam_role.lambda_worker.arn }
output "fargate_task_execution_role_arn"   { value = aws_iam_role.fargate_task_execution.arn }
output "fargate_task_role_arn"             { value = aws_iam_role.fargate_task.arn }
