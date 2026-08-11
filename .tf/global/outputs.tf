output "deploy_role_arn_stag" {
  description = "IAM role ARN for staging deploys — set as AWS_ROLE_ARN_STAG on the GitHub 'staging' environment."
  value       = aws_iam_role.deploy_stag.arn
}

output "deploy_role_arn_prod" {
  description = "IAM role ARN for production deploys — set as AWS_ROLE_ARN_PROD on the GitHub 'production' environment."
  value       = aws_iam_role.deploy_prod.arn
}
