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

# ── Crossplane Postgres access ────────────────────────────────────────
#
# The Kubernetes "edit" ClusterRole (backing AmazonEKSEditPolicy above)
# doesn't include the postgresql.sql.crossplane.io CRDs, and those CRDs are
# cluster-scoped, so a namespace-scoped EKS access policy can never reach
# them regardless of the underlying RBAC rules. Binding to Crossplane's own
# "crossplane-edit" ClusterRole would work, but it grants access to every
# service's Postgres objects on the shared cluster, not just pipo-os's own.
# Define a dedicated ClusterRole instead, scoped via `resource_names` to
# exactly the objects pipo-os's manifests create. `create` is the one verb
# Kubernetes RBAC cannot restrict by name (the object doesn't exist yet at
# creation time), so it stays cluster-wide for these four resource types —
# every other verb is scoped to pipo-os's own object names.

locals {
  pipo_os_db_objects = {
    stag = {
      database = "stag-pipo-os-pipo-os"
      role     = "stag-pipo-os-pipo-os"
      schema   = "stag-pipo-os-pipo-os-public"
      grant    = "stag-pipo-os-pipo-os-app-connect"
    }
    prod = {
      database = "prod-pipo-os-pipo-os"
      role     = "prod-pipo-os-pipo-os"
      schema   = "prod-pipo-os-pipo-os-public"
      grant    = "prod-pipo-os-pipo-os-app-connect"
    }
  }
}

resource "kubernetes_cluster_role" "crossplane_postgres_stag" {
  provider = kubernetes.stag

  metadata {
    name = "pipo-os-crossplane-postgres"
  }

  rule {
    api_groups = ["postgresql.sql.crossplane.io"]
    resources  = ["databases", "roles", "schemas", "grants"]
    verbs      = ["create"]
  }

  rule {
    api_groups     = ["postgresql.sql.crossplane.io"]
    resources      = ["databases", "databases/status"]
    resource_names = [local.pipo_os_db_objects.stag.database]
    verbs          = ["get", "update", "patch", "delete"]
  }

  rule {
    api_groups     = ["postgresql.sql.crossplane.io"]
    resources      = ["roles", "roles/status"]
    resource_names = [local.pipo_os_db_objects.stag.role]
    verbs          = ["get", "update", "patch", "delete"]
  }

  rule {
    api_groups     = ["postgresql.sql.crossplane.io"]
    resources      = ["schemas", "schemas/status"]
    resource_names = [local.pipo_os_db_objects.stag.schema]
    verbs          = ["get", "update", "patch", "delete"]
  }

  rule {
    api_groups     = ["postgresql.sql.crossplane.io"]
    resources      = ["grants", "grants/status"]
    resource_names = [local.pipo_os_db_objects.stag.grant]
    verbs          = ["get", "update", "patch", "delete"]
  }
}

resource "kubernetes_cluster_role_binding" "crossplane_postgres_stag" {
  provider = kubernetes.stag

  metadata {
    name = "pipo-os-deploy-crossplane-postgres"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.crossplane_postgres_stag.metadata[0].name
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = "pipo-os:deploy"
  }
}

resource "kubernetes_cluster_role" "crossplane_postgres_prod" {
  provider = kubernetes.prod

  metadata {
    name = "pipo-os-crossplane-postgres"
  }

  rule {
    api_groups = ["postgresql.sql.crossplane.io"]
    resources  = ["databases", "roles", "schemas", "grants"]
    verbs      = ["create"]
  }

  rule {
    api_groups     = ["postgresql.sql.crossplane.io"]
    resources      = ["databases", "databases/status"]
    resource_names = [local.pipo_os_db_objects.prod.database]
    verbs          = ["get", "update", "patch", "delete"]
  }

  rule {
    api_groups     = ["postgresql.sql.crossplane.io"]
    resources      = ["roles", "roles/status"]
    resource_names = [local.pipo_os_db_objects.prod.role]
    verbs          = ["get", "update", "patch", "delete"]
  }

  rule {
    api_groups     = ["postgresql.sql.crossplane.io"]
    resources      = ["schemas", "schemas/status"]
    resource_names = [local.pipo_os_db_objects.prod.schema]
    verbs          = ["get", "update", "patch", "delete"]
  }

  rule {
    api_groups     = ["postgresql.sql.crossplane.io"]
    resources      = ["grants", "grants/status"]
    resource_names = [local.pipo_os_db_objects.prod.grant]
    verbs          = ["get", "update", "patch", "delete"]
  }
}

resource "kubernetes_cluster_role_binding" "crossplane_postgres_prod" {
  provider = kubernetes.prod

  metadata {
    name = "pipo-os-deploy-crossplane-postgres"
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.crossplane_postgres_prod.metadata[0].name
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = "pipo-os:deploy"
  }
}
