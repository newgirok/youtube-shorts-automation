resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.worker_name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  container_definitions = jsonencode([{
    name  = var.worker_name
    image = var.image_uri
    environment = [{ name = "QUEUE_URL", value = var.queue_url }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"  = "/ecs/${var.worker_name}-worker"
        "awslogs-region" = "ap-northeast-2"
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}
