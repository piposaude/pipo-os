module "ecr_pipo_os" {
  source = "s3::https://s3-sa-east-1.amazonaws.com/pipo-terraform-modules/registry/1.tar.gz"

  service_name = "pipo-os"
  domain       = "platform"
  squad        = "plataforma"
}
