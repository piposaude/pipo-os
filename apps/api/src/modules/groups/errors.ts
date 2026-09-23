import { ConflictError } from '../../shared/errors.js'
import type { CompanyOwner } from './schemas.js'

export class CompanyCarriedConflictError extends ConflictError {
  readonly owners: CompanyOwner[]

  constructor(message: string, owners: CompanyOwner[]) {
    super(message)
    this.owners = owners
  }
}
