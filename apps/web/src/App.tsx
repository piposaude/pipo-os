import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { TicketStatus } from '@pipo-os/api-client'
import { api } from './lib/api'

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  closed: 'Closed',
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: '#2563eb',
  in_progress: '#d97706',
  closed: '#16a34a',
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Something went wrong'
}

export default function App() {
  const queryClient = useQueryClient()
  const ticketsQuery = api.useQuery('get', '/api/tickets')
  const tickets = ticketsQuery.data ?? []

  const createMutation = api.useMutation('post', '/api/tickets')
  const updateMutation = api.useMutation('put', '/api/tickets/{id}')
  const deleteMutation = api.useMutation('delete', '/api/tickets/{id}')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const invalidateTickets = () =>
    queryClient.invalidateQueries({ queryKey: api.queryOptions('get', '/api/tickets').queryKey })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return
    try {
      setError(null)
      await createMutation.mutateAsync({
        body: { title: title.trim(), description: description.trim() },
      })
      await invalidateTickets()
      setTitle('')
      setDescription('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const handleStatusChange = async (id: string, status: TicketStatus) => {
    try {
      setError(null)
      await updateMutation.mutateAsync({ params: { path: { id } }, body: { status } })
      await invalidateTickets()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      setError(null)
      await deleteMutation.mutateAsync({ params: { path: { id } } })
      await invalidateTickets()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const loading = ticketsQuery.isLoading
  const creating = createMutation.isPending
  const displayError = error ?? (ticketsQuery.isError ? errorMessage(ticketsQuery.error) : null)

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Tickets</h1>

      {displayError && (
        <div style={styles.errorBanner}>
          {displayError}
          <button style={styles.dismissBtn} onClick={() => setError(null)}>
            x
          </button>
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} style={styles.form}>
        <h2 style={styles.subheading}>New Ticket</h2>
        <input
          style={styles.input}
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          style={{ ...styles.input, height: 80, resize: 'vertical' }}
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <button style={styles.primaryBtn} type="submit" disabled={creating}>
          {creating ? 'Creating...' : 'Create Ticket'}
        </button>
      </form>

      {/* Ticket list */}
      {loading ? (
        <p style={styles.empty}>Loading tickets...</p>
      ) : tickets.length === 0 ? (
        <p style={styles.empty}>No tickets yet. Create one above.</p>
      ) : (
        <ul style={styles.list}>
          {tickets.map((ticket) => (
            <li key={ticket.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <strong style={styles.cardTitle}>{ticket.title}</strong>
                <span
                  style={{
                    ...styles.badge,
                    background: STATUS_COLORS[ticket.status],
                  }}
                >
                  {STATUS_LABELS[ticket.status]}
                </span>
              </div>
              <p style={styles.cardDesc}>{ticket.description}</p>
              <div style={styles.cardFooter}>
                <span style={styles.cardDate}>{new Date(ticket.createdAt).toLocaleString()}</span>
                <div style={styles.cardActions}>
                  <select
                    style={styles.select}
                    value={ticket.status}
                    onChange={(e) => handleStatusChange(ticket.id, e.target.value as TicketStatus)}
                  >
                    {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button style={styles.deleteBtn} onClick={() => handleDelete(ticket.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '2rem 1rem',
    fontFamily: 'system-ui, sans-serif',
    color: '#111',
  },
  heading: {
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '1.5rem',
  },
  subheading: {
    fontSize: '1.1rem',
    fontWeight: 600,
    marginBottom: '0.75rem',
  },
  errorBanner: {
    background: '#fee2e2',
    color: '#b91c1c',
    padding: '0.75rem 1rem',
    borderRadius: 6,
    marginBottom: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dismissBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
    color: '#b91c1c',
    fontSize: '1rem',
  },
  form: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '1.25rem',
    marginBottom: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  input: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    fontSize: '0.95rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    alignSelf: 'flex-start',
    padding: '0.5rem 1.25rem',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  empty: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: '2rem',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  card: {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '1rem',
    background: '#fff',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
    gap: '0.5rem',
  },
  cardTitle: {
    fontSize: '1rem',
    fontWeight: 600,
  },
  badge: {
    padding: '0.2rem 0.6rem',
    borderRadius: 999,
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  cardDesc: {
    fontSize: '0.9rem',
    color: '#374151',
    margin: '0 0 0.75rem 0',
    lineHeight: 1.5,
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  cardDate: {
    fontSize: '0.75rem',
    color: '#9ca3af',
  },
  cardActions: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  select: {
    padding: '0.35rem 0.5rem',
    fontSize: '0.85rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '0.35rem 0.75rem',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.85rem',
  },
}
