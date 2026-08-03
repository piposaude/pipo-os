terraform {
  required_version = "~> 1.3.3"
  backend "s3" {
    encrypt = true
    bucket  = "pipo-platform"
    region  = "sa-east-1"
    key     = "terraform/states/pipo-os/prod"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}
