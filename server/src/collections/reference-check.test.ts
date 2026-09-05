/**
 * That a row cannot point at another case's row.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withCase } from '../db/scope.js'
import { cases, systems } from '../db/schema/index.js'
import { danglingReferences } from './reference-check.js'
import { eventSchema } from '../domain/entities/timeline.js'
import { reportBlockSchema } from '../domain/entities/report.js'
import { reports } from '../db/schema/report.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('references that leave the case', () => {
  let mine = ''
  let theirCase = ''
  let myHost = ''
  let theirHost = ''

  beforeAll(async () => {
    const [a] = await seed!.insert(cases).values({ title: 'Refs mine' }).returning()
    const [b] = await seed!.insert(cases).values({ title: 'Refs theirs' }).returning()
    mine = a!.id
    theirCase = b!.id
    const [h1] = await seed!
      .insert(systems)
      .values({ caseId: a!.id, hostname: 'MY-HOST' })
      .returning()
    const [h2] = await seed!
      .insert(systems)
      .values({ caseId: b!.id, hostname: 'THEIR-HOST' })
      .returning()
    myHost = h1!.id
    theirHost = h2!.id
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
    if (seedPool && seedPool !== pool) await seedPool.end()
  })

  it('accepts a reference to a row in the same case', async () => {
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, eventSchema, { systemId: myHost }),
    )

    expect(dangling).toEqual([])
  })

  /** The one the foreign key lets through. */
  it('refuses a reference to another case\u2019s row', async () => {
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, eventSchema, { systemId: theirHost }),
    )

    expect(dangling).toEqual([{ field: 'systemId', target: 'systems', ids: [theirHost] }])
  })

  /**
   * **The list fields have no foreign key at all**, so nothing whatsoever
   * checked them before this - any string could be put in one.
   */
  it('checks every id in a list, not just the first', async () => {
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, eventSchema, { accountIds: [] }),
    )
    expect(dangling).toEqual([])

    const mixed = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, eventSchema, {
        systemId: myHost,
        sourceSystemId: theirHost,
      }),
    )
    expect(mixed.map((one) => one.field)).toEqual(['sourceSystemId'])
  })

  /** A field nobody filled in points nowhere, which is most of them. */
  it('passes over an absent or empty reference', async () => {
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, eventSchema, { systemId: null, description: 'no refs here' }),
    )

    expect(dangling).toEqual([])
  })

  /**
   * **An id that exists nowhere is refused the same way as one in another
   * case**, and the message does not distinguish them - telling a caller which
   * of the two it was is the existence oracle this closes.
   */
  it('refuses an id that exists nowhere, indistinguishably', async () => {
    const nowhere = '11111111-1111-4111-8111-111111111111'
    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, eventSchema, { systemId: nowhere }),
    )

    expect(dangling).toEqual([{ field: 'systemId', target: 'systems', ids: [nowhere] }])
  })

  /**
   * **Postgres is not the backstop.**
   */
  it('refuses a report block whose parent report is in another case', async () => {
    const [theirs] = await seed!
      .insert(reports)
      .values({ caseId: theirCase, label: 'Theirs', tlp: 'TLP:RED' })
      .returning()

    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, reportBlockSchema, { reportId: theirs!.id }),
    )

    expect(dangling).toEqual([{ field: 'reportId', target: 'reports', ids: [theirs!.id] }])
  })

  it('accepts a report block whose parent is in this case', async () => {
    const [ours] = await seed!
      .insert(reports)
      .values({ caseId: mine, label: 'Ours', tlp: 'TLP:RED' })
      .returning()

    const dangling = await withCase(db!, mine, (tx) =>
      danglingReferences(tx, reportBlockSchema, { reportId: ours!.id }),
    )

    expect(dangling).toEqual([])
  })
})
