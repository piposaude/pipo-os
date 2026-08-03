terraform {
  required_version = "~> 1.3.3"
  backend "s3" {
    encrypt = true
    bucket  = "pipo-platform"
    region  = "sa-east-1"
    key     = "terraform/states/pipo-os/stag"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

locals {
  environment = "stag"
}

data "terraform_remote_state" "vpc" {
  backend = "s3"
  config = {
    bucket = "pipo-platform"
    region = "sa-east-1"
    key    = "terraform/states/vpc/${local.environment}"
  }
}
