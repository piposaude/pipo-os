module "records" {
  source  = "terraform-aws-modules/route53/aws//modules/records"
  version = "~> 2.0"

  zone_name = "pipo.health"

  records = [
    {
      name    = "pipo-os-db"
      type    = "CNAME"
      ttl     = 5
      records = [module.pipo_os_db.endpoint]
    },
  ]
}
