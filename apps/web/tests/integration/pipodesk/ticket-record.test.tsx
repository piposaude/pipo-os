import { configure, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { queueSeed } from '../../fixtures/pipodesk/dataset'
import { records } from '../../fixtures/pipodesk/records'
import { displayNameOf, historyOf } from '@/lib/pipodesk/record'
import { sortTickets } from '@/lib/pipodesk/sort'
import { formatCpf, formatNumericDate } from '@/lib/pipodesk/format'
import { documentLabel } from '@/lib/pipodesk/document'
import companyCopy from '@/constants/pages/pipodesk/ticket/company'
import documentsCopy from '@/constants/pages/pipodesk/ticket/documents'
import historyCopy from '@/constants/pages/pipodesk/ticket/history'
import personCopy from '@/constants/pages/pipodesk/ticket/person'
import { taxIdOf } from '../../helpers/api'

// This route loads on demand: the first `findBy` after entering it includes a
// dynamic import, and the 1s default is not enough under parallel workers.
configure({ asyncUtilTimeout: 3000 })

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

let desk: import('../../helpers/api').ApiMock

beforeEach(async () => {
  desk = (await import('../../helpers/desk')).mountDeskFixture()
})

afterEach(() => {
  desk.restore()
})

async function openTab(path: string, tab: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
  const user = userEvent.setup()
  await user.click(await screen.findByRole('tab', { name: tab }))
  return { router, user, panel: screen.getByRole('tabpanel') }
}

const rowOf = (ticketId: string) => queueSeed.find((row) => row.id === ticketId)!
const shellRows = queueSeed.map((row) => ({ ...row, taxId: taxIdOf(row.id) }))
const personOf = (ticketId: string) =>
  records.personById.get(records.movementOf(ticketId)!.beneficiaryId)!

/** `dt` → its `dd`: the field's value as the tab prints it. */
const fieldValue = (panel: HTMLElement, label: string) =>
  within(panel).getByText(label).nextElementSibling

describe('aba Dados pessoais', () => {
  /** 705639 is a holder with a bank account, one card and no dependents —
   *  every section of the Backoffice record shows, with the values it prints. */
  it('should show the Backoffice sections of the record, the cards and the role badge', async () => {
    const { panel } = await openTab('/tickets/705639', 'Dados pessoais')
    const renata = personOf('705639')

    expect(
      within(panel).getByRole('heading', { level: 2, name: displayNameOf(renata) }),
    ).toBeInTheDocument()
    expect(within(panel).getByText(personCopy.role.holder)).toBeInTheDocument()
    for (const title of [
      personCopy.sections.personal,
      personCopy.sections.holder,
      personCopy.sections.contact,
      personCopy.sections.refund,
      personCopy.sections.cards,
    ]) {
      expect(within(panel).getByRole('heading', { level: 3, name: title })).toBeInTheDocument()
    }

    expect(fieldValue(panel, personCopy.fields.cpf)).toHaveTextContent(formatCpf(renata.cpf))
    expect(fieldValue(panel, personCopy.fields.birthDate)).toHaveTextContent('17/08/81')
    expect(fieldValue(panel, personCopy.fields.maritalStatus)).toHaveTextContent('União estável')
    expect(fieldValue(panel, personCopy.fields.weight)).toHaveTextContent('57 kg')
    expect(fieldValue(panel, personCopy.fields.height)).toHaveTextContent('1,57 m')
    expect(fieldValue(panel, personCopy.fields.salary)).toHaveTextContent('R$ 6.100,00')
    expect(fieldValue(panel, personCopy.fields.costCenter)).toHaveTextContent('CC-300 Produção')
    // An empty field carries the Backoffice dash, not a blank.
    expect(fieldValue(panel, personCopy.fields.jobTitle)).toHaveTextContent('-')
    expect(fieldValue(panel, personCopy.fields.zip)).toHaveTextContent('83805-543')
    expect(fieldValue(panel, personCopy.refund.fields.bank)).toHaveTextContent(
      '033 - BANCO SANTANDER S.A.',
    )

    const cards = within(panel).getByRole('table')
    expect(within(cards).getByText('Unimed Mineira')).toBeInTheDocument()
    expect(within(cards).getByText('Vida')).toBeInTheDocument()
    expect(within(cards).getByText('2509597491')).toBeInTheDocument()
    expect(within(cards).getByText('17/01/25')).toBeInTheDocument()
  })

  /** 700062 moves a dependent: contact is the holder's and stays out, the
   *  refund account is the holder's and says so, and the family is navigable
   *  both ways without leaving the tab. */
  it('should say a dependent has no contact of their own, and navigate to the holder and back', async () => {
    const { panel, user } = await openTab('/tickets/700062', 'Dados pessoais')
    const dependent = personOf('700062')
    const holder = records.personById.get(dependent.holderId!)!

    expect(
      within(panel).getByRole('heading', { level: 2, name: displayNameOf(dependent) }),
    ).toBeInTheDocument()
    expect(within(panel).getByText(personCopy.role.dependent)).toBeInTheDocument()
    expect(within(panel).getByText(personCopy.dependentContact[1])).toBeInTheDocument()
    expect(within(panel).queryByText(personCopy.fields.email)).not.toBeInTheDocument()
    expect(within(panel).getByText(personCopy.refund.holderBadge)).toBeInTheDocument()
    expect(fieldValue(panel, personCopy.refund.fields.holderName)).toHaveTextContent(holder.name)

    await user.click(within(panel).getByRole('button', { name: displayNameOf(holder) }))

    expect(
      within(panel).getByRole('heading', { level: 2, name: displayNameOf(holder) }),
    ).toBeInTheDocument()
    expect(within(panel).getByText(personCopy.role.holder)).toBeInTheDocument()
    expect(
      within(panel).getByRole('heading', { level: 3, name: personCopy.sections.dependents }),
    ).toBeInTheDocument()

    await user.click(
      within(panel).getByRole('button', { name: new RegExp(displayNameOf(dependent)) }),
    )

    expect(
      within(panel).getByRole('heading', { level: 2, name: displayNameOf(dependent) }),
    ).toBeInTheDocument()
  })

  /** The page does not remount between tickets — only the id changes — so
   *  the person picked on one ticket must not leak into the next. */
  it('should go back to the person of the ticket when another ticket opens', async () => {
    const { router, user } = await openTab('/tickets/700062', 'Dados pessoais')
    const holder = records.personById.get(personOf('700062').holderId!)!

    await user.click(screen.getByRole('button', { name: displayNameOf(holder) }))
    expect(
      screen.getByRole('heading', { level: 2, name: displayNameOf(holder) }),
    ).toBeInTheDocument()

    await router.navigate({ to: '/tickets/$id', params: { id: '705639' } })
    await user.click(await screen.findByRole('tab', { name: 'Dados pessoais' }))

    expect(
      await screen.findByRole('heading', { level: 2, name: displayNameOf(personOf('705639')) }),
    ).toBeInTheDocument()
  })

  it('should title the record with the social name and keep the registered name as a field', async () => {
    const { panel } = await openTab('/tickets/702350', 'Dados pessoais')
    const person = personOf('702350')

    expect(person.socialName).not.toBeNull()
    expect(
      within(panel).getByRole('heading', { level: 2, name: person.socialName! }),
    ).toBeInTheDocument()
    expect(fieldValue(panel, personCopy.fields.socialName)).toHaveTextContent(person.socialName!)
    expect(fieldValue(panel, personCopy.fields.name)).toHaveTextContent(person.name)
  })

  it('should keep the context column beside the record', async () => {
    const { panel } = await openTab('/tickets/705639', 'Dados pessoais')

    expect(
      within(panel).getByRole('complementary', { name: 'Contexto do chamado' }),
    ).toBeInTheDocument()
  })
})

describe('aba Sobre a empresa', () => {
  /** Caiçara Metalurgia (705639): a parent with branches and two contracts of
   *  other carriers; the ticket moves the expired Unimed Mineira one. */
  it('should show the company data, the contract of the ticket with a derived badge and its plan', async () => {
    const { panel } = await openTab('/tickets/705639', 'Sobre a empresa')
    const company = records.companyById.get(rowOf('705639').companyId)!

    for (const title of [
      companyCopy.sections.data,
      companyCopy.sections.ticketContract,
      companyCopy.sections.plans,
    ]) {
      expect(within(panel).getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    expect(fieldValue(panel, companyCopy.fields.cnpj)).toHaveTextContent(company.cnpj!)
    expect(fieldValue(panel, companyCopy.fields.porte)).toHaveTextContent('Empresarial')
    expect(fieldValue(panel, companyCopy.fields.structure)).toHaveTextContent(
      companyCopy.structure.parent,
    )

    const expired = within(panel).getByText('957445').closest('li')!
    expect(within(expired).getByText(companyCopy.contract.expired)).toBeInTheDocument()
    expect(within(expired).getByText(companyCopy.contract.expiredWarning)).toBeInTheDocument()
    expect(
      within(expired).getByRole('button', { name: companyCopy.contract.copyNumber('957445') }),
    ).toBeInTheDocument()
    expect(within(panel).queryByText('124588')).not.toBeInTheDocument()

    expect(within(panel).getByText('Unimed Mineira — Básico E4')).toBeInTheDocument()
    expect(within(panel).getByText('6082')).toBeInTheDocument()
    expect(within(panel).queryByText('Petlove — Pleno A2')).not.toBeInTheDocument()
  })

  it('should leave out the vault and the company files, which the snapshot does not carry', async () => {
    const { panel } = await openTab('/tickets/705639', 'Sobre a empresa')

    expect(within(panel).queryByText(companyCopy.contract.login)).not.toBeInTheDocument()
    expect(within(panel).queryByText(/sem acesso ao portal/i)).not.toBeInTheDocument()
    expect(
      within(panel).queryByRole('heading', { name: companyCopy.sections.files }),
    ).not.toBeInTheDocument()
  })

  it('should name the parent of a branch and say the contracts shown belong to the branch', async () => {
    const { panel } = await openTab('/tickets/700007', 'Sobre a empresa')
    const company = records.companyById.get(rowOf('700007').companyId)!
    const parent = records.companyById.get(company.parentId!)!

    expect(fieldValue(panel, companyCopy.fields.structure)).toHaveTextContent(
      companyCopy.structure.branchOf(parent.tradeName),
    )
    expect(
      within(panel).getByText(companyCopy.contract.branchNote(parent.tradeName, true)[1]),
    ).toBeInTheDocument()
  })

  it('should not list the sister branches of the company', async () => {
    const { panel } = await openTab('/tickets/705639', 'Sobre a empresa')
    const [firstBranch] = records.branchesOf(rowOf('705639').companyId)

    expect(within(panel).queryByText(firstBranch.legalName!)).not.toBeInTheDocument()
  })
})

describe('aba Documentos', () => {
  /** 700002 asks for RG and CPF; the RG arrived and the pendency is still
   *  open — the tab states both facts and stops there. */
  it('should list what is still missing, marking what arrived without closing the pendency', async () => {
    const { panel } = await openTab('/tickets/700002', 'Documentos')

    const missing = within(panel)
      .getByRole('heading', { level: 2, name: documentsCopy.missing.title })
      .closest('section')!
    const items = within(missing).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      `RG — ${documentsCopy.missing.arrived}`,
      'CPF',
    ])

    const received = within(panel)
      .getByRole('heading', { level: 2, name: documentsCopy.fromClient.title })
      .closest('section')!
    expect(within(received).getByText('RG.jpg')).toBeInTheDocument()
    expect(
      within(received).getByRole('button', {
        name: documentsCopy.download('RG.jpg', null, '700002-camila-machado-dantas-rg.jpg'),
      }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(within(panel).getByText(documentsCopy.downloadUnavailable)).toBeInTheDocument()
  })

  /** 700026 has two RGs: the one from 22 May stands, the one from 14 May was
   *  replaced and carries the reason. */
  it('should title the group with the file identity and mark which version stands', async () => {
    const { panel } = await openTab('/tickets/700026', 'Documentos')

    const received = within(panel)
      .getByRole('heading', { level: 2, name: documentsCopy.fromClient.title })
      .closest('section')!
    expect(within(received).getByText('RG · Carlos Rezende Zanetti · 700026')).toBeInTheDocument()

    const versions = within(
      within(received).getByText('RG · Carlos Rezende Zanetti · 700026').closest('li')!,
    ).getAllByRole('listitem')
    expect(versions[0]?.textContent).toContain(documentsCopy.version.current)
    expect(versions[1]?.textContent).toContain(documentsCopy.version.superseded)
  })

  it('should offer the name the file would be born with, since a later rename breaks validation', async () => {
    const { panel } = await openTab('/tickets/700026', 'Documentos')

    // Off, but focusable and announced: with `disabled` the name would reach
    // the mouse and nobody else.
    const current = within(panel).getByRole('button', {
      name: documentsCopy.download(
        'RG.pdf',
        documentsCopy.version.current,
        '700026-carlos-rezende-zanetti-rg.pdf',
      ),
    })
    expect(current).toHaveAttribute('aria-disabled', 'true')
    expect(current).not.toBeDisabled()

    // Two versions of one file no longer share a control name.
    expect(
      within(panel).getByRole('button', {
        name: documentsCopy.download(
          'RG.pdf',
          documentsCopy.version.superseded,
          '700026-carlos-rezende-zanetti-rg.pdf',
        ),
      }),
    ).toBeInTheDocument()
  })

  it('should keep an observation written on a version', async () => {
    const { panel } = await openTab('/tickets/700026', 'Documentos')
    const user = userEvent.setup()

    await user.click(within(panel).getAllByRole('button', { name: documentsCopy.note.empty })[0]!)
    await user.type(within(panel).getAllByRole('textbox')[0]!, 'reenviado pelo RH{Enter}')

    expect(within(panel).getByText('reenviado pelo RH')).toBeInTheDocument()
  })

  it('should drop an edit abandoned with Escape, not save it on the way out', async () => {
    const { panel } = await openTab('/tickets/700026', 'Documentos')
    const user = userEvent.setup()

    await user.click(within(panel).getAllByRole('button', { name: documentsCopy.note.empty })[0]!)
    const field = within(panel).getAllByRole('textbox')[0]!
    await user.type(field, 'rascunho')
    await user.keyboard('{Escape}')

    expect(within(panel).queryByText('rascunho')).not.toBeInTheDocument()
  })

  it('should declare that what this company requires is not mapped anywhere', async () => {
    const { panel } = await openTab('/tickets/700026', 'Documentos')

    const block = within(panel)
      .getByRole('heading', { level: 2, name: documentsCopy.mandatory.title })
      .closest('section')!
    expect(within(block).getByText(/não está em sistema nenhum/)).toBeInTheDocument()
  })

  /** The two-word key with an accent: matched on the normalised key, so a
   *  change to the label cannot silently stop marking what arrived. */
  it('should mark the proof of address as arrived, though key and file name spell it differently', async () => {
    const { panel } = await openTab('/tickets/700139', 'Documentos')

    const missing = within(panel)
      .getByRole('heading', { level: 2, name: documentsCopy.missing.title })
      .closest('section')!
    expect(
      within(missing)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([`${documentLabel('comprovante-residencia')} — ${documentsCopy.missing.arrived}`])
  })

  /** An exclusion never has an adhesion form; the empty group says why
   *  instead of vanishing. */
  it('should explain an empty Pipo group instead of hiding it, and skip the missing block when nothing is asked', async () => {
    const { panel } = await openTab('/tickets/705639', 'Documentos')

    expect(
      within(panel).queryByRole('heading', { level: 2, name: documentsCopy.missing.title }),
    ).not.toBeInTheDocument()
    expect(within(panel).getByText(documentsCopy.fromClient.empty)).toBeInTheDocument()
    expect(
      within(panel).getByText(documentsCopy.fromPipo.notInclusion('Exclusão')),
    ).toBeInTheDocument()
  })
})

describe('aba Histórico', () => {
  it('should list the tickets of the beneficiary newest first, with the current one marked', async () => {
    const { panel } = await openTab('/tickets/705639', 'Histórico')
    const expected = historyOf(shellRows, { ...rowOf('705639'), taxId: taxIdOf('705639') })
    expect(expected.length).toBeGreaterThan(1)

    const table = within(panel).getByRole('table')
    const [, ...rows] = within(table).getAllByRole('row')
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(
      expected.map((row) => row.id),
    )

    const current = within(table).getByText('705639')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current.closest('a')).toBeNull()

    const other = expected.find((row) => row.id !== '705639')!
    expect(within(table).getByRole('link', { name: other.id })).toHaveAttribute(
      'href',
      `/tickets/${other.id}`,
    )

    const closed = expected.find((row) => row.closedAt !== null)!
    const closedRow = within(table).getByText(closed.id).closest('tr')!
    expect(closedRow).toHaveTextContent(historyCopy.closedAt(formatNumericDate(closed.closedAt)))
    const openRow = within(table).getByText('705639').closest('tr')!
    expect(openRow).not.toHaveTextContent(/^.*em \d\d\/\d\d\/\d\d$/)
    expect(within(panel).getByText(historyCopy.openOnly)).toBeInTheDocument()
  })

  it('should reorder by Situação when its title is clicked, and flip on the second click', async () => {
    const { panel, user } = await openTab('/tickets/705639', 'Histórico')
    const expected = historyOf(shellRows, { ...rowOf('705639'), taxId: taxIdOf('705639') })
    const idsOf = () =>
      within(within(panel).getByRole('table'))
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0].textContent)

    await user.click(within(panel).getByRole('button', { name: historyCopy.columns.situation }))
    expect(idsOf()).toEqual(
      sortTickets(expected, { by: 'status', direction: 'asc' }).map((row) => row.id),
    )

    await user.click(within(panel).getByRole('button', { name: historyCopy.columns.situation }))
    expect(idsOf()).toEqual(
      sortTickets(expected, { by: 'status', direction: 'desc' }).map((row) => row.id),
    )
  })

  it('should open another ticket from anywhere on its row, and leave the current one inert', async () => {
    const { panel, user, router } = await openTab('/tickets/705639', 'Histórico')
    const other = historyOf(shellRows, { ...rowOf('705639'), taxId: taxIdOf('705639') }).find(
      (row) => row.id !== '705639',
    )!
    const table = within(panel).getByRole('table')

    await user.click(
      within(within(table).getByText('705639').closest('tr')!).getAllByRole('cell')[1],
    )
    expect(router.state.location.pathname).toBe('/tickets/705639')

    await user.click(
      within(within(table).getByText(other.id).closest('tr')!).getAllByRole('cell')[1],
    )
    expect(router.state.location.pathname).toBe(`/tickets/${other.id}`)
  })

  it('should stand aside on a meta-click, so the row does not steal the tab from the link', async () => {
    const { panel, user, router } = await openTab('/tickets/705639', 'Histórico')
    const other = historyOf(shellRows, { ...rowOf('705639'), taxId: taxIdOf('705639') }).find(
      (row) => row.id !== '705639',
    )!
    const table = within(panel).getByRole('table')

    await user.keyboard('{Meta>}')
    await user.click(
      within(within(table).getByText(other.id).closest('tr')!).getAllByRole('cell')[1],
    )
    await user.keyboard('{/Meta}')

    expect(router.state.location.pathname).toBe('/tickets/705639')
  })

  it('should open another ticket of the person from its id', async () => {
    const { panel, user, router } = await openTab('/tickets/705639', 'Histórico')
    const other = historyOf(shellRows, { ...rowOf('705639'), taxId: taxIdOf('705639') }).find(
      (row) => row.id !== '705639',
    )!

    await user.click(within(panel).getByRole('link', { name: other.id }))

    expect(router.state.location.pathname).toBe(`/tickets/${other.id}`)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: other.beneficiaryName ?? other.subject,
      }),
    ).toBeInTheDocument()
  })
})
