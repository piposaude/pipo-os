import type { Kysely } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { CreateTicketBody, Ticket, UpdateTicketBody } from './schemas.js'

interface TicketRow {
  id: string
  title: string
  description: string
  status: string
  created_at: Date
}

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as Ticket['status'],
    createdAt: row.created_at.toISOString(),
  }
}

export interface TicketsRepositoryPort {
  findAll(): Promise<Ticket[]>
  create(data: CreateTicketBody): Promise<Ticket>
  update(id: string, data: UpdateTicketBody): Promise<Ticket | undefined>
  delete(id: string): Promise<boolean>
}

export class TicketsRepository implements TicketsRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async findAll(): Promise<Ticket[]> {
    const rows = await this.db
      .selectFrom('tickets')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute()

    return rows.map(toTicket)
  }

  async create(data: CreateTicketBody): Promise<Ticket> {
    const row = await this.db
      .insertInto('tickets')
      .values({
        title: data.title,
        description: data.description,
        status: data.status ?? 'open',
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return toTicket(row)
  }

  async update(id: string, data: UpdateTicketBody): Promise<Ticket | undefined> {
    const row = await this.db
      .updateTable('tickets')
      .set({
        title: data.title,
        description: data.description,
        status: data.status,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    return row ? toTicket(row) : undefined
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('tickets').where('id', '=', id).executeTakeFirst()

    return result.numDeletedRows > 0n
  }
}
