output "task_definition_arn" { value = aws_ecs_task_definition.worker.arn }
output "service_name"        { value = aws_ecs_service.worker.name }
