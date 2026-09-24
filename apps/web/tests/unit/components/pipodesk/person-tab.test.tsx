import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PersonTab } from '@/components/pipodesk/ticket/PersonTab'
import copy from '@/constants/pages/pipodesk/ticket/person'
import recordCopy from '@/constants/pages/pipodesk/ticket/record'
import { formatNumericDate } from '@/lib/pipodesk/format'
import { company, link, person, recordsWith } from '../../../helpers/records'

describe('PersonTab', () => {
  /** The labels say "do titular"; the values must be the holder's even when
   *  the record gives the dependent an employment link of their own. */
  it('should show the holder employment in Dados do titular for a dependent', () => {
    const records = recordsWith({
      beneficiaries: [
        person('holder', { link: link({ registration: '47865' }) }),
        person('dep', {
          role: 'dependent',
          holderId: 'holder',
          link: link({ registration: '99999' }),
        }),
      ],
    })
    render(
      <PersonTab
        personId="dep"
        records={records}
        capturedAt="2026-08-01T12:00:00.000Z"
        onSelectPerson={() => {}}
      />,
    )

    const holderSection = screen
      .getByRole('heading', { level: 3, name: copy.sections.holder })
      .closest('section')!
    expect(
      within(holderSection).getByText(copy.fields.registration).nextElementSibling,
    ).toHaveTextContent('47865')
  })

  /** Same source as the section above it: the company whose Backoffice is
   *  down is the holder's, whatever the dependent's own copy says. */
  it('should warn about the Backoffice of the holder company for a dependent', () => {
    const records = recordsWith({
      companies: [company('company-1'), company('company-2')],
      beneficiaries: [
        person('holder'),
        person('dep', {
          role: 'dependent',
          holderId: 'holder',
          link: link({ companyId: 'company-2' }),
        }),
      ],
      boOutageCompanyIds: ['company-1'],
    })
    render(
      <PersonTab
        personId="dep"
        records={records}
        capturedAt="2026-08-01T12:00:00.000Z"
        onSelectPerson={() => {}}
      />,
    )

    expect(screen.getByText(recordCopy.outage.title)).toBeInTheDocument()
  })

  /** The badge and the note say the account is the holder's. They must read
   *  whose account it is, not the role: a dependent may have one of their own. */
  it("should not call the account the holder's when the dependent has one", () => {
    const account = {
      holderName: 'Dep',
      holderCpf: '00000000000',
      bank: '033 - BANCO SANTANDER S.A.',
      agency: '0001',
      account: '12345-6',
    }
    const records = recordsWith({
      beneficiaries: [
        person('holder', { bankAccount: { ...account, holderName: 'Titular' } }),
        person('dep', { role: 'dependent', holderId: 'holder', bankAccount: account }),
      ],
    })
    render(
      <PersonTab
        personId="dep"
        records={records}
        capturedAt="2026-08-01T12:00:00.000Z"
        onSelectPerson={() => {}}
      />,
    )

    const refund = screen
      .getByRole('heading', { level: 3, name: copy.sections.refund })
      .closest('section')!
    expect(
      within(refund).getByText(copy.refund.fields.holderName).nextElementSibling,
    ).toHaveTextContent('Dep')
    expect(screen.queryByText(copy.refund.holderBadge)).not.toBeInTheDocument()
    expect(screen.queryByText(copy.refund.dependentNote[1])).not.toBeInTheDocument()
  })

  it("should say the account is the holder's when the dependent has none", () => {
    const account = {
      holderName: 'Titular',
      holderCpf: '00000000000',
      bank: '033 - BANCO SANTANDER S.A.',
      agency: '0001',
      account: '12345-6',
    }
    const records = recordsWith({
      beneficiaries: [
        person('holder', { bankAccount: account }),
        person('dep', { role: 'dependent', holderId: 'holder' }),
      ],
    })
    render(
      <PersonTab
        personId="dep"
        records={records}
        capturedAt="2026-08-01T12:00:00.000Z"
        onSelectPerson={() => {}}
      />,
    )

    expect(screen.getByText(copy.refund.holderBadge)).toBeInTheDocument()
    expect(screen.getByText(copy.refund.dependentNote[1])).toBeInTheDocument()
  })

  /** `holderId` apontando para quem não está no retrato: a seção inteira fala
   *  "do titular", então mostrar o vínculo do próprio dependente ali é mentira. */
  it('should say the holder is missing instead of showing the dependent job as theirs', () => {
    const records = recordsWith({
      beneficiaries: [
        person('dep', {
          role: 'dependent',
          holderId: 'quem-nao-esta-no-retrato',
          link: link({ registration: '99999' }),
        }),
      ],
    })
    render(
      <PersonTab
        personId="dep"
        records={records}
        capturedAt="2026-08-01T12:00:00.000Z"
        onSelectPerson={() => {}}
      />,
    )

    const holderSection = screen
      .getByRole('heading', { level: 3, name: copy.sections.holder })
      .closest('section')!
    expect(within(holderSection).getByText(copy.holderMissing)).toBeInTheDocument()
    expect(within(holderSection).queryByText('99999')).not.toBeInTheDocument()
    expect(within(holderSection).queryByText(copy.fields.registration)).not.toBeInTheDocument()
  })

  /** O botão clicado some com a troca; sem devolver o foco, quem usa teclado
   *  volta para o topo da página. */
  it('should move focus to the name after switching person', async () => {
    const user = userEvent.setup()
    const records = recordsWith({
      beneficiaries: [person('holder'), person('dep', { role: 'dependent', holderId: 'holder' })],
    })
    // A página é quem decide quem está na tela; aqui ela é este estado.
    function Page() {
      const [personId, setPersonId] = useState('dep')
      return (
        <PersonTab
          personId={personId}
          records={records}
          capturedAt="2026-08-01T12:00:00.000Z"
          onSelectPerson={setPersonId}
        />
      )
    }
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Pessoa holder' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Pessoa holder' })).toHaveFocus()
  })

  it('should not steal focus when it only mounts', () => {
    const records = recordsWith({ beneficiaries: [person('holder')] })
    render(
      <PersonTab
        personId="holder"
        records={records}
        capturedAt="2026-08-01T12:00:00.000Z"
        onSelectPerson={() => {}}
      />,
    )

    expect(screen.getByRole('heading', { level: 2 })).not.toHaveFocus()
  })

  /** É este ramo que justifica a ref guardar o id em vez de um booleano: com o
   *  booleano, qualquer troca depois do clique movia o foco. */
  it('should not focus the name when the page switches to someone other than the person asked for', async () => {
    const user = userEvent.setup()
    const records = recordsWith({
      beneficiaries: [
        person('holder'),
        person('outra'),
        person('dep', { role: 'dependent', holderId: 'holder' }),
      ],
    })
    function Page() {
      const [personId, setPersonId] = useState('dep')
      // A página decide quem entra na tela, e aqui ela decide outra pessoa.
      return (
        <PersonTab
          personId={personId}
          records={records}
          capturedAt="2026-08-01T12:00:00.000Z"
          onSelectPerson={() => setPersonId('outra')}
        />
      )
    }
    render(<Page />)

    await user.click(screen.getByRole('button', { name: 'Pessoa holder' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Pessoa outra' })).not.toHaveFocus()
  })

  it('should list the dependents as a table with a title per column', () => {
    const records = recordsWith({
      beneficiaries: [person('holder'), person('dep', { role: 'dependent', holderId: 'holder' })],
    })
    render(
      <PersonTab
        personId="holder"
        records={records}
        capturedAt="2026-08-01T12:00:00.000Z"
        onSelectPerson={() => {}}
      />,
    )

    const section = screen
      .getByRole('heading', { level: 3, name: copy.sections.dependents })
      .closest('section')!
    const table = within(section).getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([
      copy.dependents.columns.name,
      copy.dependents.columns.relationship,
      copy.dependents.columns.birthDate,
      copy.dependents.columns.cpf,
      copy.dependents.columns.benefits,
    ])
  })

  it('should open the dependent from anywhere on their row', async () => {
    const selected: string[] = []
    const records = recordsWith({
      beneficiaries: [person('holder'), person('dep', { role: 'dependent', holderId: 'holder' })],
    })
    render(
      <PersonTab
        personId="holder"
        records={records}
        capturedAt="2026-08-01T12:00:00.000Z"
        onSelectPerson={(id) => selected.push(id)}
      />,
    )

    const row = screen.getByRole('cell', { name: copy.role.dependent }).closest('tr')!
    await userEvent.setup().click(within(row).getAllByRole('cell')[2])

    expect(selected).toEqual(['dep'])
  })

  it('should print the birth date and the card start as dd/mm/aa', () => {
    const records = recordsWith({
      beneficiaries: [
        person('holder', {
          birthDate: '1978-09-10',
          cards: [
            {
              id: 'card-1',
              carrierId: 'carrier-1',
              product: 'health',
              number: '123',
              validFrom: '2024-03-01',
            },
          ],
        }),
      ],
    })
    render(
      <PersonTab
        personId="holder"
        records={records}
        capturedAt="2026-08-01T12:00:00.000Z"
        onSelectPerson={() => {}}
      />,
    )

    expect(screen.getByText(copy.fields.birthDate).nextElementSibling).toHaveTextContent('10/09/78')
    const card = records.personById.get('holder')!.cards[0]
    expect(
      screen.getByRole('cell', { name: formatNumericDate(card.validFrom) }),
    ).toBeInTheDocument()
  })
})
