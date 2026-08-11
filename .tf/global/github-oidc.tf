locals {
  github_oidc_provider_url = "token.actions.githubusercontent.com"
  github_org               = "piposaude"
  github_repo              = "pipo-os"
}

# GitHub Actions OIDC provider — unique per AWS account.
# If it already exists (created by the tools repo), import it instead of recreating:
#   terraform import aws_iam_openid_connect_provider.github \
#     arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://${local.github_oidc_provider_url}"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# ── IAM policy: ECR push/pull + EKS describe ────────────────────────

data "aws_caller_identity" "current" {}

resource "aws_iam_policy" "deploy" {
  name = "github-deploy-pipo-os"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ECRAuth"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "ECRPushPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = "arn:aws:ecr:sa-east-1:${data.aws_caller_identity.current.account_id}:repository/services/*"
      },
      {
        Sid    = "EKSDescribe"
        Effect = "Allow"
        Action = "eks:DescribeCluster"
        Resource = [
          "arn:aws:eks:sa-east-1:${data.aws_caller_identity.current.account_id}:cluster/pipo-stag",
          "arn:aws:eks:sa-east-1:${data.aws_caller_identity.current.account_id}:cluster/pipo-prod",
        ]
      },
    ]
  })
}

# AWS requires the trust policy to constrain `sub` (or `job_workflow_ref`) —
# it rejects a policy that only scopes on other claims. The org has
# "include repo/org ID in subject claims" enabled, which turns `sub` into
# `repo:piposaude@<org_id>/pipo-os@<repo_id>:environment:staging` instead of
# the plain `repo:piposaude/pipo-os:environment:staging`, so `sub` is matched
# with StringLike (wildcarding the optional `@<id>` suffixes) to tolerate
# that toggle being flipped either way. `repository`/`environment` are kept
# as an additional StringEquals check for defense in depth.

# ── Staging role ─────────────────────────────────────────────────────

resource "aws_iam_role" "deploy_stag" {
  name = "github-deploy-pipo-os-stag"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${local.github_oidc_provider_url}:aud"         = "sts.amazonaws.com"
            "${local.github_oidc_provider_url}:repository"  = "${local.github_org}/${local.github_repo}"
            "${local.github_oidc_provider_url}:environment" = "staging"
          }
          StringLike = {
            "${local.github_oidc_provider_url}:sub" = "repo:${local.github_org}*/${local.github_repo}*:environment:staging"
          }
        }
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "deploy_stag" {
  role       = aws_iam_role.deploy_stag.name
  policy_arn = aws_iam_policy.deploy.arn
}

# ── Production role ──────────────────────────────────────────────────

resource "aws_iam_role" "deploy_prod" {
  name = "github-deploy-pipo-os-prod"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${local.github_oidc_provider_url}:aud"         = "sts.amazonaws.com"
            "${local.github_oidc_provider_url}:repository"  = "${local.github_org}/${local.github_repo}"
            "${local.github_oidc_provider_url}:environment" = "production"
          }
          StringLike = {
            "${local.github_oidc_provider_url}:sub" = "repo:${local.github_org}*/${local.github_repo}*:environment:production"
          }
        }
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "deploy_prod" {
  role       = aws_iam_role.deploy_prod.name
  policy_arn = aws_iam_policy.deploy.arn
}
