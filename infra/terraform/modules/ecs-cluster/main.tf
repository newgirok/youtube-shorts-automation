resource "aws_ecs_cluster" "cluster" {
  name = var.cluster_name

  # Container Insights 비활성화 (비용 절감)
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}
