import express, { type Request, type Response } from 'express'
import cors from 'cors'
import path from 'path'
import { pool, migrate } from './db.js'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

type TicketStatus = 'open' | 'in_progress' | 'closed'

interface Ticket {
  id: string
  title: string
  description: string
  status: TicketStatus
  createdAt: string
}

function toTicket(row: Record<string, unknown>): Ticket {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    status: row.status as TicketStatus,
    createdAt: (row.created_at as Date).toISOString(),
  }
}

app.get('/api/tickets', async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC')
  res.json(result.rows.map(toTicket))
})

app.post('/api/tickets', async (req: Request, res: Response) => {
  const { title, description, status } = req.body as Partial<Ticket>

  if (!title || !description) {
    res.status(400).json({ error: 'title and description are required' })
    return
  }

  const result = await pool.query(
    `INSERT INTO tickets (title, description, status)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [title, description, status ?? 'open'],
  )
  res.status(201).json(toTicket(result.rows[0]))
})

app.put('/api/tickets/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { title, description, status } = req.body as Partial<Ticket>

  const result = await pool.query(
    `UPDATE tickets
     SET
       title       = COALESCE($1, title),
       description = COALESCE($2, description),
       status      = COALESCE($3, status)
     WHERE id = $4
     RETURNING *`,
    [title ?? null, description ?? null, status ?? null, id],
  )

  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }

  res.json(toTicket(result.rows[0]))
})

app.delete('/api/tickets/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const result = await pool.query('DELETE FROM tickets WHERE id = $1', [id])

  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }

  res.status(204).send()
})

if (process.env.NODE_ENV === 'production') {
  const staticDir = path.join(import.meta.dirname, '../public')
  app.use(express.static(staticDir))
  app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')))
}

migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`))
  })
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
