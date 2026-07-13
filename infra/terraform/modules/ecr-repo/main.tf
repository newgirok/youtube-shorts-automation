variable "name" { type = string }
variable "image_tag_mutability" {
  type    = string
  default = "IMMUTABLE"
}

resource "aws_ecr_repository" "repo" {
  name                 = var.name
  image_tag_mutability = var.image_tag_mutability
  image_scanning_configuration { scan_on_push = true }
}

output "repository_url" { value = aws_ecr_repository.repo.repository_url }
