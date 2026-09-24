// @vitest-environment node
import { companiesFixture, queueSeed, structureFixture } from '@/fixtures/pipodesk/dataset'
import { records } from '@/fixtures/pipodesk/records'
import { API_STATUSES } from '@/lib/pipodesk/status'
import { PRIORITIES } from '@/lib/pipodesk/ticket-row'

/**
 * O exportador valida o vocabulário, mas só quando alguém roda
 * `pnpm fixture:export`. Estes casos afirmam o mesmo sobre os JSONs que estão
 * commitados, para uma fixture regenerada fora de vocabulário quebrar no CI.
 */
describe('vocabulário das fixtures commitadas', () => {
  const offenders = <T>(items: T[], ok: (item: T) => boolean) => items.filter((i) => !ok(i))

  it('should keep every person inside the record unions', () => {
    const people = [...records.personById.values()]
    expect(people.length).toBeGreaterThan(0)
    expect(offenders(people, (p) => p.role === 'holder' || p.role === 'dependent')).toEqual([])
    expect(offenders(people, (p) => p.sex === 'f' || p.sex === 'm')).toEqual([])
    expect(
      offenders(people, (p) =>
        ['single', 'married', 'divorced', 'widowed', 'domestic-partnership'].includes(
          p.maritalStatus!,
        ),
      ).map((p) => p.id),
    ).toEqual([])
  })

  it('should keep every document inside its scope and origin unions', () => {
    const companyIds = [...records.companyById.keys()]
    const docs = [
      ...queueSeed.flatMap((row) => records.documentsOf('ticket', row.id)),
      ...companyIds.flatMap((id) => records.documentsOf('company', id)),
      ...companyIds.flatMap((id) =>
        records.contractsOf(id).flatMap((c) => records.documentsOf('contract', c.id)),
      ),
    ]
    // Sem isto o caso passaria vazio: nenhum documento é nenhum infrator.
    expect(docs.length).toBeGreaterThan(0)
    expect(offenders(docs, (d) => ['ticket', 'company', 'contract'].includes(d.scope))).toEqual([])
    expect(offenders(docs, (d) => d.origin === 'pipo' || d.origin === 'client')).toEqual([])
  })

  it('should keep every membership role and queue sort inside their unions', () => {
    expect(
      offenders(structureFixture.memberships, (m) => m.role === 'admin' || m.role === 'member').map(
        (m) => m.userId,
      ),
    ).toEqual([])
    expect(structureFixture.queues.length).toBeGreaterThan(0)
    expect(
      offenders(structureFixture.queues, (q) =>
        ['actionDate', 'createdAt', 'updatedAt', 'company', 'status'].includes(q.sort.by),
      ).map((q) => q.id),
    ).toEqual([])
    expect(
      offenders(structureFixture.queues, (q) => ['asc', 'desc'].includes(q.sort.direction)).map(
        (q) => q.id,
      ),
    ).toEqual([])
  })

  it('should keep every queue row status and priority inside their unions', () => {
    expect(queueSeed.length).toBeGreaterThan(0)
    expect(
      offenders(queueSeed, (row) => API_STATUSES.includes(row.status)).map((row) => row.id),
    ).toEqual([])
    expect(
      offenders(queueSeed, (row) => row.priority === null || PRIORITIES.includes(row.priority)).map(
        (row) => row.id,
      ),
    ).toEqual([])
  })

  it('should keep the contractual SLA a number of hours when a company has one', () => {
    const withSla = companiesFixture.filter((c) => c.contractualSla !== null)
    expect(withSla.length).toBeGreaterThan(0)
    expect(
      offenders(withSla, (c) => Number.isFinite(c.contractualSla!.hours)).map((c) => c.id),
    ).toEqual([])
  })
})
