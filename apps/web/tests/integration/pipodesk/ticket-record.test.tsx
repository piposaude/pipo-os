import { configure, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { queueSeed } from '@/fixtures/pipodesk/dataset'
import { records } from '@/fixtures/pipodesk/records'
import { displayNameOf, historyOf } from '@/lib/pipodesk/record'
import { formatCpf, formatLongDate, formatNumericDate } from '@/lib/pipodesk/format'
import { documentLabel } from '@/lib/pipodesk/document'
import companyCopy from '@/constants/pages/pipodesk/ticket/company'
import documentsCopy from '@/constants/pages/pipodesk/ticket/documents'
import historyCopy from '@/constants/pages/pipodesk/ticket/history'
import personCopy from '@/constants/pages/pipodesk/ticket/person'
import recordCopy from '@/constants/pages/pipodesk/ticket/record'
import secretCopy from '@/constants/pipodesk/secret'

// This route loads on demand: the first `findBy` after entering it includes a
// dynamic import, and the 1s default is not enough under parallel workers.
configure({ asyncUtilTimeout: 3000 })

vi.mock('@/lib/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(true),
  logout: vi.fn(),
}))

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
    expect(fieldValue(panel, personCopy.fields.birthDate)).toHaveTextContent('17 de Agosto de 1981')
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
    expect(within(cards).getByText('17 de Janeiro de 2025')).toBeInTheDocument()
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

  it('should warn that the record is a saved picture when the Backoffice is down for the company', async () => {
    const { panel } = await openTab('/tickets/700127', 'Dados pessoais')

    expect(records.isBackofficeDown(rowOf('700127').companyId)).toBe(true)
    expect(within(panel).getByText(recordCopy.outage.title)).toBeInTheDocument()
    expect(
      within(panel).getByText(recordCopy.outage.body(formatLongDate(rowOf('700127').createdAt))),
    ).toBeInTheDocument()
  })

  it('should keep the context column beside the record', async () => {
    const { panel } = await openTab('/tickets/705639', 'Dados pessoais')

    expect(
      within(panel).getByRole('complementary', { name: 'Contexto do chamado' }),
    ).toBeInTheDocument()
  })
})

describe('aba Sobre a empresa', () => {
  /** Caiçara Metalurgia (705639): a parent with branches, two contracts — one
   *  expired with a pending file, one active — two plans and the two company
   *  files the Backoffice generates. */
  it('should show the company data, its branches, the contracts with a derived badge and the vault', async () => {
    const { panel, user } = await openTab('/tickets/705639', 'Sobre a empresa')
    const company = records.companyById.get(rowOf('705639').companyId)!

    // Straight under the page's h1: the tab has no card of its own to carry an h2.
    for (const title of Object.values(companyCopy.sections)) {
      expect(within(panel).getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    expect(fieldValue(panel, companyCopy.fields.legalName)).toHaveTextContent(company.legalName)
    expect(fieldValue(panel, companyCopy.fields.cnpj)).toHaveTextContent(company.cnpj)
    expect(fieldValue(panel, companyCopy.fields.porte)).toHaveTextContent('Empresarial')
    expect(fieldValue(panel, companyCopy.fields.structure)).toHaveTextContent(
      companyCopy.structure.parent,
    )

    const [firstBranch] = records.branchesOf(company.id)
    expect(within(panel).getByText(firstBranch.legalName)).toBeInTheDocument()
    expect(within(panel).getByText(firstBranch.cnpj)).toBeInTheDocument()

    // The badge is derived from the term, never stored: 957445 ended in 2025.
    const expired = within(panel).getByText('957445').closest('li')!
    expect(within(expired).getByText(companyCopy.contract.expired)).toBeInTheDocument()
    expect(within(expired).getByText(companyCopy.contract.expiredWarning)).toBeInTheDocument()
    expect(within(expired).getByText(/Sem arquivo anexado/)).toHaveTextContent('Arquivo pendente')
    expect(
      within(expired).getByRole('button', { name: companyCopy.contract.copyNumber('957445') }),
    ).toBeInTheDocument()
    const active = within(panel).getByText('124588').closest('li')!
    expect(within(active).getByText(companyCopy.contract.active)).toBeInTheDocument()
    expect(within(active).getByText('1 arquivo anexado')).toBeInTheDocument()
    expect(within(active).getByText('Petlove')).toBeInTheDocument()

    // The vault: portal and login copyable, the password masked until the eye.
    expect(within(expired).getByText('portal.unimedmineira.com.br/rh')).toBeInTheDocument()
    expect(within(expired).getByText('pipo.caicara-metalurgia')).toBeInTheDocument()
    expect(within(expired).queryByText('34q5-EM7J-68!')).not.toBeInTheDocument()
    await user.click(
      within(expired).getByRole('button', {
        name: secretCopy.show(companyCopy.contract.passwordLabel),
      }),
    )
    expect(within(expired).getByText('34q5-EM7J-68!')).toBeInTheDocument()
    expect(
      within(expired).getByRole('button', { name: companyCopy.contract.copyPassword }),
    ).toBeInTheDocument()
    expect(within(expired).getByText('Senha atualizada em 26 de Julho de 2025')).toBeInTheDocument()

    // Prêmios shows only the policy this ticket moves, not every plan of the company.
    expect(within(panel).getByText('Unimed Mineira — Básico E4')).toBeInTheDocument()
    expect(within(panel).getByText('6082')).toBeInTheDocument()
    expect(within(panel).queryByText('Petlove — Pleno A2')).not.toBeInTheDocument()

    expect(within(panel).getByText('Cartão CNPJ — Caiçara Metalurgia.pdf')).toBeInTheDocument()
    expect(within(panel).getByText('798 KB')).toBeInTheDocument()
  })

  it('should name the parent of a branch and say the contracts shown belong to the branch', async () => {
    const { panel } = await openTab('/tickets/700007', 'Sobre a empresa')
    const company = records.companyById.get(rowOf('700007').companyId)!
    const parent = records.companyById.get(company.parentId!)!

    expect(fieldValue(panel, companyCopy.fields.structure)).toHaveTextContent(
      companyCopy.structure.branchOf(parent.tradeName),
    )
    expect(
      within(panel).getByText(companyCopy.contract.branchNote(parent.tradeName)[1]),
    ).toBeInTheDocument()
  })

  it('should say a contract has no vault instead of showing empty lines', async () => {
    const { panel } = await openTab('/tickets/700000', 'Sobre a empresa')

    expect(within(panel).getAllByText(companyCopy.contract.noAccess).length).toBeGreaterThan(0)
  })

  it('should tell the contractual SLA apart as a spreadsheet fact, not a system field', async () => {
    const { panel } = await openTab('/tickets/700032', 'Sobre a empresa')

    const lead = within(panel).getByText(companyCopy.slaNote(48, true)[1])
    expect(lead.tagName).toBe('STRONG')
    expect(lead.closest('p')).toHaveTextContent('com multa')
  })

  it('should warn about the saved picture when the Backoffice is down for the company', async () => {
    const { panel } = await openTab('/tickets/700127', 'Sobre a empresa')

    expect(within(panel).getByText(recordCopy.outage.title)).toBeInTheDocument()
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
    expect(within(received).getByText('1590 KB')).toBeInTheDocument()
    // No file behind the fixture: the control shows where the action lives, off,
    // and the reason is on screen — a disabled button takes no focus.
    expect(
      within(received).getByRole('button', {
        name: documentsCopy.download('RG.jpg', null, '700002-camila-machado-dantas-rg.jpg'),
      }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(within(panel).getByText(documentsCopy.downloadUnavailable)).toBeInTheDocument()

    const generated = within(panel)
      .getByRole('heading', { level: 2, name: documentsCopy.fromPipo.title })
      .closest('section')!
    expect(within(generated).getByText('Ficha de adesão.pdf')).toBeInTheDocument()
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
    expect(within(received).getByText('Desatualizado — vencido')).toBeInTheDocument()
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

  /** `??` and not `||` in the note fallback: emptying a seeded note has to clear
   *  it, not fall back to the fixture value it just replaced. */
  it('should clear a seeded observation when it is emptied', async () => {
    const { panel } = await openTab('/tickets/700026', 'Documentos')
    const user = userEvent.setup()

    await user.click(within(panel).getByRole('button', { name: 'Desatualizado — vencido' }))
    await user.clear(within(panel).getAllByRole('textbox')[0]!)
    await user.keyboard('{Enter}')

    expect(within(panel).queryByText('Desatualizado — vencido')).not.toBeInTheDocument()
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

  it('should warn about the saved picture when the Backoffice is down for the company', async () => {
    const { panel } = await openTab('/tickets/700127', 'Documentos')

    expect(within(panel).getByText(recordCopy.outage.title)).toBeInTheDocument()
  })
})

describe('aba Histórico', () => {
  /** Every ticket of the same person, open and closed, newest first — the
   *  current one marked and not a link, the others links to their pages. */
  it('should list the tickets of the beneficiary newest first, with the current one marked', async () => {
    const { panel } = await openTab('/tickets/705639', 'Histórico')
    const expected = historyOf(queueSeed, records, '705639')
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
  })

  it('should open another ticket of the person from its id', async () => {
    const { panel, user, router } = await openTab('/tickets/705639', 'Histórico')
    const other = historyOf(queueSeed, records, '705639').find((row) => row.id !== '705639')!

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
