# declares variables which will be consumed as ENV_VARS
variable "prod_db_user" {
  type        = string
  description = "DB user on prod env"
  sensitive   = true
}

variable "prod_db_password" {
  type        = string
  description = "DB password on prod env"
  sensitive   = true
}
