terraform {
  required_version = "~> 1.3.3"
  backend "s3" {
    encrypt = true
    bucket  = "pipo-platform"
    region  = "sa-east-1"
    key     = "terraform/states/pipo-os/eks-access"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.40.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.31"
    }
  }
}

provider "aws" {
  region = "sa-east-1"
}

data "aws_eks_cluster" "stag" {
  name = "pipo-stag"
}

data "aws_eks_cluster_auth" "stag" {
  name = "pipo-stag"
}

data "aws_eks_cluster" "prod" {
  name = "pipo-prod"
}

data "aws_eks_cluster_auth" "prod" {
  name = "pipo-prod"
}

provider "kubernetes" {
  alias                  = "stag"
  host                   = data.aws_eks_cluster.stag.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.stag.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.stag.token
}

provider "kubernetes" {
  alias                  = "prod"
  host                   = data.aws_eks_cluster.prod.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.prod.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.prod.token
}
