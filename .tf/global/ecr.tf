module "ecr_pipo_os_api" {
  source = "s3::https://s3-sa-east-1.amazonaws.com/pipo-terraform-modules/registry/1.tar.gz"

  service_name = "pipo-os-api"
  domain       = "platform"
  squad        = "plataforma"
}

module "ecr_pipo_os_web" {
  source = "s3::https://s3-sa-east-1.amazonaws.com/pipo-terraform-modules/registry/1.tar.gz"

  service_name = "pipo-os-web"
  domain       = "platform"
  squad        = "plataforma"
}
