# declares variables which will be consumed as ENV_VARS
variable "stag_db_user" {
  type        = string
  description = "DB user on staging env"
  sensitive   = true
}

variable "stag_db_password" {
  type        = string
  description = "DB password on staging env"
  sensitive   = true
}
