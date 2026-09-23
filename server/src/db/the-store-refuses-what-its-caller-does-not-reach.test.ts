/**
 * The store answers a case's rows only to somebody who reaches that case.
 *
 * > Whether a caller may see a row MUST be enforced by the store that holds
 * > it, so that a request the interface did not anticipate cannot reach a row
 * > the caller may not see.
 *
 * **The attack is a handler that names the wrong case.** Each sweep sets the
 * scope a request would set -- the case and who is asking -- straight on a
 * transaction of the role the server connects as, with no guard, service or
 * route in front of it, and asks every table holding case data for the rows of
 * a case the asker does not reach.
 *
 * **The subjects are derived, and every one holds rows first.** A table with a
 * foreign key to `cases`, and `cases` itself, is a subject whether or not
 * anybody remembered it, and a row is written into each through the seeding
 * role before the sweep, so an empty table cannot pass for a refusing one.
 */
import { randomUUID } from 'node:crypto'

import { eq, getTableColumns, getTableName, inArray, is, sql, type Column } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from './schema/index.js'
import { asRole, hasConcurrentConnections, openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
/** The role the server serves requests as, which is the one under test. */
const appPool = URL_ ? openTestPool(URL_, 'ic_app') : null
const app = appPool ? drizzle({ client: appPool }) : null
/** Exempt by its own policy, and used only to arrange and to count. */
const seedPool = URL_ ? openTestPool(asRole(URL_, 'ic_seed')) : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

interface Subject {
  name: string
  table: PgTable
  /** The column naming the case: `id` on `cases`, the foreign key everywhere else. */
  caseColumn: Column
  /** Subjects a row here has to name, so they are written first. */
  parents: string[]
}

/** Every table with a foreign key to `cases`, and `cases` itself, parents first. */
function subjects(): Subject[] {
  const found: Subject[] = []
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    const config = getTableConfig(value)
    if (config.name === 'cases') {
      found.push({ name: 'cases', table: value, caseColumn: schema.cases.id, parents: [] })
      continue
    }
    const references = config.foreignKeys.map((key) => key.reference())
    const toCase = references.find((one) => getTableName(one.foreignTable) === 'cases')
    if (!toCase) continue
    const parents = references
      .filter((one) => one.columns.every((column) => column.notNull))
      .map((one) => getTableName(one.foreignTable))
      .filter((parent) => parent !== 'cases' && parent !== 'user')
    found.push({ name: config.name, table: value, caseColumn: toCase.columns[0]!, parents })
  }
  const ordered: Subject[] = []
  const place = (one: Subject): void => {
    if (ordered.includes(one)) return
    for (const parent of one.parents) place(found.find((other) => other.name === parent)!)
    ordered.push(one)
  }
  // `cases` first: every other row names one.
  for (const one of found.sort(
    (a, b) =>
      Number(b.name === 'cases') - Number(a.name === 'cases') || a.name.localeCompare(b.name),
  )) {
    place(one)
  }
  return ordered
}

/**
 * A row for `subject` in `caseId`, from what its columns demand.
 *
 * Only the columns that are required and have no default are given a value,
 * so a table added tomorrow gets a row without anybody writing one for it.
 */
function aRow(
  subject: Subject,
  caseId: string,
  customerId: string,
  userId: string,
  written: Map<string, string>,
): Record<string, unknown> {
  if (subject.name === 'cases') return { id: caseId, title: 'Out of reach', customerId }
  const row: Record<string, unknown> = {}
  const references = getTableConfig(subject.table).foreignKeys.map((key) => key.reference())
  for (const [key, column] of Object.entries(getTableColumns(subject.table))) {
    if (!column.notNull || column.hasDefault) continue
    const reference = references.find((one) => one.columns.includes(column))
    const target = reference ? getTableName(reference.foreignTable) : null
    if (target === 'cases') row[key] = caseId
    else if (target === 'user') row[key] = userId
    else if (target) row[key] = written.get(target)
    else if (column.enumValues?.length) row[key] = column.enumValues[0]
    else if (column.dataType.startsWith('string uuid')) row[key] = randomUUID()
    else if (column.dataType.startsWith('string')) row[key] = 'out of reach'
    else if (column.dataType.startsWith('object date')) row[key] = new Date()
    else if (column.dataType.startsWith('object json')) row[key] = {}
    else if (column.dataType.startsWith('number')) row[key] = 1
    else if (column.dataType.startsWith('boolean')) row[key] = false
    else
      throw new Error(
        `${subject.name}.${column.name} is a ${column.dataType}, which this cannot fill`,
      )
  }
  return row
}

type App = NonNullable<typeof app>
type Tx = Parameters<Parameters<App['transaction']>[0]>[0]

/** Work as `principal` with `caseId` in scope, the way a request's scope is set, then undone. */
async function asking<T>(
  principal: string | null,
  caseId: string | null,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  let answer: T | undefined
  await app!
    .transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.case_id', ${caseId ?? ''}, true), set_config('app.principal', ${principal ?? ''}, true)`,
      )
      answer = await work(tx)
      throw ROLLBACK
    })
    .catch((error: unknown) => {
      if (error !== ROLLBACK) throw error
    })
  return answer as T
}
const ROLLBACK = new Error('rolled back on purpose')

const rowsOf = (tx: Tx | NonNullable<typeof seed>, subject: Subject, caseId: string) =>
  tx.select().from(subject.table).where(eq(subject.caseColumn, caseId))

/** The rows of `caseId` an update touches: the case column set to what it holds. */
const updated = (tx: Tx, subject: Subject, caseId: string) => {
  const [key] = Object.entries(getTableColumns(subject.table)).find(
    ([, column]) => column === subject.caseColumn,
  )!
  return tx
    .update(subject.table)
    .set({ [key]: caseId })
    .where(eq(subject.caseColumn, caseId))
    .returning()
}

const deleted = async (tx: Tx, subject: Subject, caseId: string): Promise<unknown[]> =>
  (await tx.delete(subject.table).where(eq(subject.caseColumn, caseId)).returning()) as unknown[]

describe.skipIf(!app || !hasConcurrentConnections())(
  'the store refuses a case its caller does not reach',
  () => {
    const tables = subjects()
    const stamp = `${String(process.pid)}-${String(Date.now())}`
    const insider = `store-insider-${stamp}`
    const outsider = `store-outsider-${stamp}`
    /** Holds read over the customer, which sees its rows and changes none. */
    const reader = `store-reader-${stamp}`
    /** Holds delete over the customer, which is what removing a case asks. */
    const remover = `store-remover-${stamp}`
    const theirs = randomUUID()
    const everyones = randomUUID()
    let customer = ''
    let group = ''

    beforeAll(async () => {
      const users = [insider, outsider, reader, remover].map((id) => ({
        id,
        name: id,
        email: `${id}@example.invalid`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'analyst',
      }))
      await seed!.insert(schema.user).values(users)
      const [made] = await seed!
        .insert(schema.customers)
        .values({ name: `Out of reach ${stamp}` })
        .returning({ id: schema.customers.id })
      customer = made!.id
      const [held] = await seed!
        .insert(schema.groups)
        .values({ name: `Holds it ${stamp}` })
        .returning({ id: schema.groups.id })
      group = held!.id
      await seed!.insert(schema.groupCustomers).values({ groupId: group, customerId: customer })
      await seed!.insert(schema.groupMembers).values([
        { groupId: group, userId: insider, level: 'write' },
        { groupId: group, userId: reader, level: 'read' },
        { groupId: group, userId: remover, level: 'delete' },
      ])

      const [fallback] = await seed!
        .select({ id: schema.customers.id })
        .from(schema.customers)
        .where(eq(schema.customers.isDefault, true))

      // One case the insider reaches and the outsider does not, and one under
      // the default customer, which every account the install holds reaches.
      for (const [caseId, customerId, visitor] of [
        [theirs, customer, outsider],
        [everyones, fallback!.id, outsider],
      ] as const) {
        const written = new Map<string, string>()
        for (const subject of tables) {
          const [row] = (await seed!
            .insert(subject.table)
            .values(aRow(subject, caseId, customerId, visitor, written))
            .returning()) as Record<string, unknown>[]
          if (typeof row?.['id'] === 'string') written.set(subject.name, row['id'])
        }
      }
    })

    afterAll(async () => {
      await seed!.delete(schema.cases).where(inArray(schema.cases.id, [theirs, everyones]))
      await seed!.delete(schema.groups).where(eq(schema.groups.id, group))
      await seed!.delete(schema.customers).where(eq(schema.customers.id, customer))
      await seed!
        .delete(schema.user)
        .where(inArray(schema.user.id, [insider, outsider, reader, remover]))
      await appPool!.end()
      await seedPool!.end()
    })

    /** The vacuity guard: a sweep over no tables, or over empty ones, passes everything below. */
    it('finds every table holding case data, and a row in each', async () => {
      expect(tables.map((one) => one.name)).toEqual(
        expect.arrayContaining(['cases', 'case_visits']),
      )
      expect(tables.length, 'too few tables carry a case to be the whole store').toBeGreaterThan(15)
      for (const subject of tables) {
        expect(
          await rowsOf(seed!, subject, theirs),
          `${subject.name} holds no row, so refusing it would prove nothing`,
        ).not.toHaveLength(0)
      }
    })

    it.each(tables.map((one) => one.name))(
      '%s answers nothing with no case in scope and nobody named',
      async (name) => {
        const subject = tables.find((one) => one.name === name)!
        expect(await asking(null, null, (tx) => rowsOf(tx, subject, theirs))).toHaveLength(0)
      },
    )

    it.each(tables.map((one) => one.name))(
      '%s answers nothing to a caller who does not reach the case the handler named',
      async (name) => {
        const subject = tables.find((one) => one.name === name)!
        expect(
          await asking(outsider, theirs, (tx) => rowsOf(tx, subject, theirs)),
          `${name} served another customer's case to an account in no group that holds it`,
        ).toHaveLength(0)
      },
    )

    it.each(tables.map((one) => one.name))(
      '%s answers nothing to an identity the install does not hold, even for the default customer',
      async (name) => {
        const subject = tables.find((one) => one.name === name)!
        expect(
          await asking(randomUUID(), everyones, (tx) => rowsOf(tx, subject, everyones)),
          `${name} served a case to an id that names no account`,
        ).toHaveLength(0)
      },
    )

    it.each(tables.map((one) => one.name))(
      '%s refuses a row written into a case its caller does not reach',
      async (name) => {
        const subject = tables.find((one) => one.name === name)!
        const parents = new Map<string, string>()
        for (const parent of subject.parents) {
          const [row] = (await rowsOf(
            seed!,
            tables.find((one) => one.name === parent)!,
            theirs,
          )) as {
            id: string
          }[]
          parents.set(parent, row!.id)
        }
        const planted = aRow(
          subject,
          subject.name === 'cases' ? randomUUID() : theirs,
          customer,
          outsider,
          parents,
        )
        const refused = await asking(outsider, theirs, (tx) =>
          tx
            .insert(subject.table)
            .values(planted)
            .then(() => null)
            .catch((error: unknown) => error as { code?: string; cause?: { code?: string } }),
        )
        expect(
          refused,
          `${name} took a row from an account that does not reach the case`,
        ).not.toBeNull()
        // `42501` is the store's own refusal, not a key or a type the row got wrong.
        expect(refused!.code ?? refused!.cause?.code).toBe('42501')
      },
    )

    /**
     * **The control, without which every refusal above is weak.** An empty
     * answer is also what a connection blind to the table returns; the insider,
     * through the same role and the same scope, is what shows the policy is
     * doing the work.
     */
    it.each(tables.map((one) => one.name))(
      '%s answers its rows to a caller who reaches the case',
      async (name) => {
        const subject = tables.find((one) => one.name === name)!
        // A visit is its visitor's alone, so the insider sees theirs and nobody else's.
        const who = name === 'case_visits' ? outsider : insider
        if (name === 'case_visits') {
          await seed!
            .insert(schema.groupMembers)
            .values({ groupId: group, userId: outsider, level: 'read' })
        }
        try {
          expect(await asking(who, theirs, (tx) => rowsOf(tx, subject, theirs))).not.toHaveLength(0)
        } finally {
          if (name === 'case_visits') {
            await seed!.delete(schema.groupMembers).where(eq(schema.groupMembers.userId, outsider))
          }
        }
      },
    )

    it.each(tables.map((one) => one.name))(
      '%s changes and removes nothing for a caller who only reads the case',
      async (name) => {
        const subject = tables.find((one) => one.name === name)!
        const changed = await asking(reader, theirs, async (tx) => [
          ...(await updated(tx, subject, theirs)),
          ...(await deleted(tx, subject, theirs)),
        ])
        expect(changed, `${name} let a reader change or remove a row`).toHaveLength(0)
      },
    )

    /** The control: the same update, by a caller who writes the case, touches its rows. */
    it.each(tables.map((one) => one.name).filter((name) => name !== 'case_visits'))(
      '%s is changed by a caller who writes the case',
      async (name) => {
        const subject = tables.find((one) => one.name === name)!
        expect(await asking(insider, theirs, (tx) => updated(tx, subject, theirs))).not.toHaveLength(
          0,
        )
      },
    )

    it('removes a case only for a caller who holds delete over it', async () => {
      const subject = tables.find((one) => one.name === 'cases')!
      expect(
        await asking(insider, theirs, (tx) => deleted(tx, subject, theirs)),
        'a caller who only writes the case removed it',
      ).toHaveLength(0)
      expect(await asking(remover, theirs, (tx) => deleted(tx, subject, theirs))).toHaveLength(1)
    })

    it("keeps one analyst's visits from another who reaches the case", async () => {
      const subject = tables.find((one) => one.name === 'case_visits')!
      const seen = await asking(insider, theirs, async (tx) => [
        ...(await rowsOf(tx, subject, theirs)),
        ...(await updated(tx, subject, theirs)),
        ...(await deleted(tx, subject, theirs)),
      ])
      expect(seen, "a reaching analyst read or changed another analyst's visit").toHaveLength(0)
      expect(await rowsOf(seed!, subject, theirs), 'no visit to hide').not.toHaveLength(0)
    })
  },
)
