import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'

const POD_3 = 'POD 3'
const POD_5 = 'POD 5'
const ANA = 'ana@pipo.health'
const BRUNO = 'bruno@pipo.health'
const COMPANY_A = '00000000-0000-4000-8000-00000000000a'
const COMPANY_C = '00000000-0000-4000-8000-00000000000c'

const UNIQUE_VIOLATION = '23505'
const FK_VIOLATION = '23503'
const CHECK_VIOLATION = '23514'
/** `RAISE EXCEPTION` without a condition name — what the cycle trigger throws. */
const RAISED_EXCEPTION = 'P0001'

/** The pg error code of a rejected write, so a test names the constraint that
 *  fired instead of only asserting that something failed. */
async function codeOf(write: Promise<unknown>): Promise<string | undefined> {
  try {
    await write
    return undefined
  } catch (err) {
    return err instanceof Error && 'code' in err ? (err.code as string) : undefined
  }
}

describe('groups schema — hierarchy and portfolio constraints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_group_member_companies').execute()
    await app.db.deleteFrom('ticket_group_companies').execute()
    await app.db.deleteFrom('ticket_group_members').execute()
    await app.db.deleteFrom('ticket_groups').execute()
  })

  const group = async (name: string, parentId?: string): Promise<string> => {
    const row = await app.db
      .insertInto('ticket_groups')
      .values({ name, created_by: 'test', ...(parentId !== undefined && { parent_id: parentId }) })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  const member = (groupId: string, userId: string, role?: string): Promise<unknown> =>
    app.db
      .insertInto('ticket_group_members')
      .values({ group_id: groupId, user_id: userId, ...(role !== undefined && { role }) })
      .execute()

  const carry = (groupId: string, companyId: string): Promise<unknown> =>
    app.db
      .insertInto('ticket_group_companies')
      .values({ group_id: groupId, company_id: companyId })
      .execute()

  const assign = (groupId: string, userId: string, companyId: string): Promise<unknown> =>
    app.db
      .insertInto('ticket_group_member_companies')
      .values({ group_id: groupId, user_id: userId, company_id: companyId })
      .execute()

  describe('hierarchy', () => {
    it('links a pod to its parent group', async () => {
      const geben = await group('Gestão de Benefícios')
      const pod = await group(POD_3, geben)

      const children = await app.db
        .selectFrom('ticket_groups')
        .select(['id', 'name'])
        .where('parent_id', '=', geben)
        .execute()

      expect(children).toEqual([{ id: pod, name: POD_3 }])
    })

    it('leaves the root group without a parent', async () => {
      await group('Gestão de Benefícios')

      const roots = await app.db
        .selectFrom('ticket_groups')
        .select('name')
        .where('parent_id', 'is', null)
        .execute()

      expect(roots).toEqual([{ name: 'Gestão de Benefícios' }])
    })

    /**
     * Self-parenting is a cycle of one hop, so the trigger owns it too — and a
     * BEFORE trigger runs ahead of constraint validation, which is why the
     * code is the trigger's and not the CHECK's. One code for every cycle
     * length is also what the handler in PD-050 will want to map. The CHECK
     * from 0024 stays as the cheap guard that survives a disabled trigger.
     */
    it('refuses a group that is its own parent', async () => {
      const id = await group(POD_3)

      const code = await codeOf(
        app.db.updateTable('ticket_groups').set({ parent_id: id }).where('id', '=', id).execute(),
      )

      expect(code).toBe(RAISED_EXCEPTION)
    })

    /**
     * The CHECK only covers depth 1 (`parent_id <> id`). A cycle needs to walk
     * the ancestors, so it is a trigger — and it has to live in the database:
     * the API is not the only thing that writes here (migrations, backfills
     * and psql sessions do too).
     */
    it('refuses a cycle two levels up', async () => {
      const geben = await group('Gestão de Benefícios')
      const pod = await group(POD_3, geben)

      const code = await codeOf(
        app.db
          .updateTable('ticket_groups')
          .set({ parent_id: pod })
          .where('id', '=', geben)
          .execute(),
      )

      expect(code).toBe(RAISED_EXCEPTION)
    })

    it('refuses a longer cycle, three levels up', async () => {
      const geben = await group('Gestão de Benefícios')
      const pod = await group(POD_3, geben)
      const squad = await group('Squad', pod)

      const code = await codeOf(
        app.db
          .updateTable('ticket_groups')
          .set({ parent_id: squad })
          .where('id', '=', geben)
          .execute(),
      )

      expect(code).toBe(RAISED_EXCEPTION)
    })

    it('still accepts a deeper tree that is not a cycle', async () => {
      const geben = await group('Gestão de Benefícios')
      const pod = await group(POD_3, geben)

      await expect(group('Squad', pod)).resolves.toBeTruthy()
    })

    /**
     * NOT enforced, and on purpose: a unique partial index on
     * `parent_id IS NULL` cannot coexist with the parentless groups
     * `POST /api/groups` creates today. This test states the gap instead of
     * leaving it to be discovered — PD-050 decides whether the API refuses a
     * second root or the schema starts to.
     */
    it('accepts a second root today, which the schema does not prevent', async () => {
      await group('Gestão de Benefícios')

      await expect(group('Outra raiz')).resolves.toBeTruthy()
    })

    it('refuses to delete a group that still has children', async () => {
      const geben = await group('Gestão de Benefícios')
      await group(POD_3, geben)

      const code = await codeOf(
        app.db.deleteFrom('ticket_groups').where('id', '=', geben).execute(),
      )

      expect(code).toBe(FK_VIOLATION)
    })
  })

  describe('member role', () => {
    /** `analyst` is not a role: the CHECK admits `admin | member`, and the
     *  default is the second. The old title invented a third. */
    it('defaults the role of a new membership to member', async () => {
      const pod = await group(POD_3)
      await member(pod, ANA)

      const row = await app.db
        .selectFrom('ticket_group_members')
        .select('role')
        .executeTakeFirstOrThrow()

      expect(row.role).toBe('member')
    })

    it('refuses a role outside admin and member', async () => {
      const pod = await group(POD_3)

      expect(await codeOf(member(pod, ANA, 'coordenacao'))).toBe(CHECK_VIOLATION)
    })
  })

  describe("the pod's portfolio", () => {
    it('refuses the same company in a second pod', async () => {
      const pod3 = await group(POD_3)
      const pod5 = await group(POD_5)
      await carry(pod3, COMPANY_A)

      expect(await codeOf(carry(pod5, COMPANY_A))).toBe(UNIQUE_VIOLATION)
    })

    it('moves a company between pods by delete and reinsert, dropping who followed it', async () => {
      const pod3 = await group(POD_3)
      const pod5 = await group(POD_5)
      await member(pod3, ANA)
      await carry(pod3, COMPANY_A)
      await assign(pod3, ANA, COMPANY_A)

      await app.db
        .deleteFrom('ticket_group_companies')
        .where('company_id', '=', COMPANY_A)
        .execute()
      await carry(pod5, COMPANY_A)

      const carried = await app.db
        .selectFrom('ticket_group_companies')
        .select('group_id')
        .executeTakeFirstOrThrow()
      const followers = await app.db
        .selectFrom('ticket_group_member_companies')
        .selectAll()
        .execute()

      expect(carried.group_id).toBe(pod5)
      expect(followers).toEqual([])
    })

    it('moves an unfollowed company in place, since no sub-portfolio row blocks it', async () => {
      const pod3 = await group(POD_3)
      const pod5 = await group(POD_5)
      await carry(pod3, COMPANY_A)

      await app.db
        .updateTable('ticket_group_companies')
        .set({ group_id: pod5 })
        .where('company_id', '=', COMPANY_A)
        .execute()

      const row = await app.db
        .selectFrom('ticket_group_companies')
        .select('group_id')
        .executeTakeFirstOrThrow()

      expect(row.group_id).toBe(pod5)
    })

    /** The UPDATE is refused only while a sub-portfolio row references the
     *  company: the two composite FKs are jointly unsatisfiable then, so the
     *  move becomes delete-and-reinsert. */
    it('refuses to move a company by updating group_id while someone follows it', async () => {
      const pod3 = await group(POD_3)
      const pod5 = await group(POD_5)
      await member(pod3, ANA)
      await carry(pod3, COMPANY_A)
      await assign(pod3, ANA, COMPANY_A)

      const code = await codeOf(
        app.db
          .updateTable('ticket_group_companies')
          .set({ group_id: pod5 })
          .where('company_id', '=', COMPANY_A)
          .execute(),
      )

      expect(code).toBe(FK_VIOLATION)
    })

    it('refuses to delete a pod that still carries companies', async () => {
      const pod = await group(POD_3)
      await carry(pod, COMPANY_A)

      expect(await codeOf(app.db.deleteFrom('ticket_groups').where('id', '=', pod).execute())).toBe(
        FK_VIOLATION,
      )
    })
  })

  describe("the person's sub-portfolio", () => {
    it('assigns a company of the pod to a member of the pod', async () => {
      const pod = await group(POD_3)
      await member(pod, ANA)
      await carry(pod, COMPANY_A)

      await assign(pod, ANA, COMPANY_A)

      const rows = await app.db
        .selectFrom('ticket_group_member_companies')
        .select(['user_id', 'company_id'])
        .execute()

      expect(rows).toEqual([{ user_id: ANA, company_id: COMPANY_A }])
    })

    it('refuses a company that is not in the pod portfolio', async () => {
      const pod3 = await group(POD_3)
      const pod5 = await group(POD_5)
      await member(pod3, ANA)
      await carry(pod5, COMPANY_C)

      expect(await codeOf(assign(pod3, ANA, COMPANY_C))).toBe(FK_VIOLATION)
    })

    it('refuses someone who is not a member of the pod', async () => {
      const pod3 = await group(POD_3)
      const pod5 = await group(POD_5)
      await member(pod5, BRUNO)
      await carry(pod3, COMPANY_A)

      expect(await codeOf(assign(pod3, BRUNO, COMPANY_A))).toBe(FK_VIOLATION)
    })

    it('drops the sub-portfolio when the company leaves the pod portfolio', async () => {
      const pod = await group(POD_3)
      await member(pod, ANA)
      await carry(pod, COMPANY_A)
      await assign(pod, ANA, COMPANY_A)

      await app.db
        .deleteFrom('ticket_group_companies')
        .where('company_id', '=', COMPANY_A)
        .execute()

      const rows = await app.db.selectFrom('ticket_group_member_companies').selectAll().execute()

      expect(rows).toEqual([])
    })

    it('drops the sub-portfolio when the person leaves the pod', async () => {
      const pod = await group(POD_3)
      await member(pod, ANA)
      await carry(pod, COMPANY_A)
      await assign(pod, ANA, COMPANY_A)

      await app.db.deleteFrom('ticket_group_members').where('user_id', '=', ANA).execute()

      const rows = await app.db.selectFrom('ticket_group_member_companies').selectAll().execute()

      expect(rows).toEqual([])
    })
  })

  /**
   * `company_id` has no foreign key and cannot have one: companies live in
   * another service, so there is no table to reference. The column being
   * `uuid` is all the database can guarantee — that it is a UUID, never that
   * it names a company. The validation belongs to the edge that will write it
   * (PD-051); this test states the limit so nobody reads the missing FK as an
   * oversight.
   */
  it('accepts a company id that names no company, because no table can be referenced', async () => {
    const pod = await group(POD_3)
    const semDono = '00000000-0000-4000-8000-0000000000ff'

    await expect(carry(pod, semDono)).resolves.toBeTruthy()
  })

  it('still refuses a company id that is not a uuid', async () => {
    const pod = await group(POD_3)

    const code = await codeOf(
      app.db
        .insertInto('ticket_group_companies')
        .values({ group_id: pod, company_id: 'empresa-1' as never })
        .execute(),
    )

    expect(code).toBeDefined()
  })

  it('stores an e-mail as the member id', async () => {
    const pod = await group(POD_3)
    await member(pod, ANA)

    const row = await app.db
      .selectFrom('ticket_group_members')
      .select('user_id')
      .executeTakeFirstOrThrow()

    expect(row.user_id).toBe(ANA)
  })
})
