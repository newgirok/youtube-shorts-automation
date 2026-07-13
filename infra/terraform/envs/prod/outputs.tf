# S3
output "s3_bucket_name" { value = module.s3.bucket_name }
output "s3_bucket_arn"  { value = module.s3.bucket_arn }

# SQS
output "script_queue_url"   { value = module.script_queue.url }
output "tts_queue_url"      { value = module.tts_queue.url }
output "subtitle_queue_url" { value = module.subtitle_queue.url }
output "render_queue_url"   { value = module.render_queue.url }
output "upload_queue_url"   { value = module.upload_queue.url }

# IAM
output "lambda_role_arn"                { value = module.iam.lambda_role_arn }
output "fargate_task_execution_role_arn" { value = module.iam.fargate_task_execution_role_arn }
output "fargate_task_role_arn"          { value = module.iam.fargate_task_role_arn }

# ECR
output "ecr_render_url" { value = module.ecr_render.repository_url }

# ECS
output "ecs_cluster_arn" { value = module.ecs_cluster.cluster_arn }
