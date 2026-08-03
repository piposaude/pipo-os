module "pipo_os_db" {
  source = "s3::https://s3-sa-east-1.amazonaws.com/pipo-terraform-modules/database/19.tar.gz"

  storage_encrypted        = false
  backup_retention_period  = 7
  backup_window            = "03:00-06:00"
  maintenance_window       = "Mon:00:00-Mon:03:00"

  region      = "sa-east-1"
  environment = local.environment
  name        = "pipo-os"
  squad       = "plataforma"
  domain      = "platform"

  storage        = 50
  storage_type   = "gp3"
  engine         = "postgres"
  engine_version = "15.17"
  instance_type  = "m6g.large"
  db_user        = var.prod_db_user
  db_password    = var.prod_db_password
  vpc_id         = data.terraform_remote_state.vpc.outputs.vpc_id
}
