import { useState, type FormEvent } from 'react'
import {
  Banner,
  Button,
  Heading,
  Placeholder,
  SkeletonBox,
  TextInput,
} from '@piposaude/design-system'
import { TextArea } from '@/components/ui'
import { TicketsTable } from '@/components/tickets/TicketsTable'
import { useTickets } from '@/hooks/use-tickets'
import constants from '@/constants/pages/tickets/list'
import './style.css'

export default function TicketsList() {
  const {
    tickets,
    isInitialLoading,
    loadFailed,
    actionFailed,
    dismissActionError,
    isCreating,
    createTicket,
    updateTicketStatus,
    deleteTicket,
  } = useTickets()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || !description.trim()) {
      return
    }
    const created = await createTicket({
      title: title.trim(),
      description: description.trim(),
    })
    if (created) {
      setTitle('')
      setDescription('')
    }
  }

  return (
    <main className="tickets-list-page">
      <Heading level="h1">{constants.title}</Heading>

      {loadFailed && <Banner variant="alert">{constants.errors.load}</Banner>}
      {actionFailed && (
        <Banner variant="alert" onDismiss={dismissActionError}>
          {constants.errors.action}
        </Banner>
      )}

      <section className="new-ticket">
        <Heading level="h3">{constants.form.heading}</Heading>
        <form className="new-ticket-form" onSubmit={handleSubmit}>
          <TextInput
            label={constants.form.titleLabel}
            placeholder={constants.form.titlePlaceholder}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <TextArea
            label={constants.form.descriptionLabel}
            placeholder={constants.form.descriptionPlaceholder}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
          <Button className="new-ticket-submit" type="submit" loading={isCreating}>
            {constants.form.submit}
          </Button>
        </form>
      </section>

      {isInitialLoading ? (
        <div className="tickets-skeleton" aria-hidden="true">
          <SkeletonBox height="40px" />
          <SkeletonBox height="52px" />
          <SkeletonBox height="52px" />
          <SkeletonBox height="52px" />
        </div>
      ) : tickets.length === 0 ? (
        !loadFailed && (
          <Placeholder title={constants.empty.title} subtitle={constants.empty.subtitle} />
        )
      ) : (
        <TicketsTable
          tickets={tickets}
          labels={{
            headers: constants.table,
            status: constants.status,
            changeStatus: constants.actions.changeStatus,
            delete: constants.actions.delete,
          }}
          onChangeStatus={updateTicketStatus}
          onDelete={deleteTicket}
        />
      )}
    </main>
  )
}
