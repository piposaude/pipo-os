data "terraform_remote_state" "global" {
  backend = "s3"

  config = {
    bucket = "pipo-platform"
    key    = "terraform/states/pipo-os/global"
    region = "sa-east-1"
  }
}

# ── Staging: access entry on pipo-stag ───────────────────────────────

resource "aws_eks_access_entry" "deploy_stag" {
  cluster_name      = "pipo-stag"
  principal_arn     = data.terraform_remote_state.global.outputs.deploy_role_arn_stag
  type              = "STANDARD"
  kubernetes_groups = ["pipo-os:deploy"]
}

resource "aws_eks_access_policy_association" "deploy_stag" {
  cluster_name  = "pipo-stag"
  principal_arn = data.terraform_remote_state.global.outputs.deploy_role_arn_stag
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"

  access_scope {
    type       = "namespace"
    namespaces = ["default"]
  }

  depends_on = [aws_eks_access_entry.deploy_stag]
}

# ── Production: access entry on pipo-prod ────────────────────────────

resource "aws_eks_access_entry" "deploy_prod" {
  cluster_name      = "pipo-prod"
  principal_arn     = data.terraform_remote_state.global.outputs.deploy_role_arn_prod
  type              = "STANDARD"
  kubernetes_groups = ["pipo-os:deploy"]
}

resource "aws_eks_access_policy_association" "deploy_prod" {
  cluster_name  = "pipo-prod"
  principal_arn = data.terraform_remote_state.global.outputs.deploy_role_arn_prod
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"

  access_scope {
    type       = "namespace"
    namespaces = ["default"]
  }

  depends_on = [aws_eks_access_entry.deploy_prod]
}

# ── Crossplane Postgres binding ───────────────────────────────────────
#
# The Kubernetes "edit" ClusterRole (backing AmazonEKSEditPolicy above)
# doesn't include the postgresql.sql.crossplane.io CRDs, and those CRDs are
# cluster-scoped, so a namespace-scoped EKS access policy can never reach
# them regardless of the underlying RBAC rules. Bind the deploy principals
# to Crossplane's own "crossplane-edit" ClusterRole (already granting get/
# create/update on databases, roles, schemas and grants) via a dedicated
# Kubernetes group instead.

resource "kubernetes_cluster_role_binding" "crossplane_edit_stag" {
  provider = kubernetes.stag

  metadata {
    name = "pipo-os-deploy-crossplane-edit"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = "crossplane-edit"
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = "pipo-os:deploy"
  }
}

resource "kubernetes_cluster_role_binding" "crossplane_edit_prod" {
  provider = kubernetes.prod

  metadata {
    name = "pipo-os-deploy-crossplane-edit"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = "crossplane-edit"
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = "pipo-os:deploy"
  }
}
