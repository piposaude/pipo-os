module "pipo_os_db" {
  source = "s3::https://s3-sa-east-1.amazonaws.com/pipo-terraform-modules/database/19.tar.gz"

  storage_encrypted = false

  region      = "sa-east-1"
  environment = local.environment
  name        = "pipo-os"
  squad       = "plataforma"
  domain      = "platform"

  storage        = 20
  storage_type   = "gp3"
  engine         = "postgres"
  engine_version = "15.17"
  instance_type  = "t4g.medium"
  db_user        = var.stag_db_user
  db_password    = var.stag_db_password
  vpc_id         = data.terraform_remote_state.vpc.outputs.vpc_id
}
