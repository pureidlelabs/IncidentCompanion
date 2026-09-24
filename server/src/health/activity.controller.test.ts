/**
 * Asserts *which source* the activity counts come from, not the arithmetic:
 * anything reading the case-owned tables directly answers zero under row-level
 * security, which reads as an empty database rather than a scoping mistake.
 *
 * Runs against a stubbed database, so it cannot see whether
 * `pg_stat_user_tables` is populated on a real install.
 */
import { describe, expect, it, vi } from 'vitest'

import { ActivityController } from './activity.controller.js'
import { actingAs } from '../db/scope.js'
import type { ConfigService } from '@nestjs/config'

import type { Database } from '../db/client.js'
import type { Env } from '../config/env.js'

/**
 * **The two URLs, as a laptop has them.** The controller reads them to say
 * whether Postgres is the machine serving the app; the tests below care about
 * the arithmetic, so this is the boring case and `where` has its own file.
 */
const CONFIG = {
  get: (key: string) =>
    key === 'DATABASE_URL'
      ? 'postgres://u:p@127.0.0.1:5432/db'
      : 'redis://127.0.0.1:6379',
} as unknown as ConfigService<Env, true>

/**
 * A database whose every query answers from a script, in call order. Naming
 * who is asking, as a transaction opened for case data does first, is not a
 * query the script answers.
 */
function scripted(answers: unknown[][]): { db: Database; calls: string[] } {
  const calls: string[] = []
  const execute = vi.fn((query: unknown) => {
    const said = String(JSON.stringify(query))
    if (said.includes('app.principal')) return Promise.resolve({ rows: [] })
    calls.push(said)
    return Promise.resolve({ rows: answers[calls.length - 1] ?? [] })
  })
  const db = {
    execute,
    transaction: (work: (tx: unknown) => Promise<unknown>) => work({ execute }),
  } as unknown as Database
  return { db, calls }
}

/** What the route answers an administrator. */
const readAs = (db: Database) =>
  actingAs('an-administrator', () => new ActivityController(db, CONFIG).read())

const TABLES = [
  { name: 'timeline', rows: '183', bytes: '147456' },
  { name: 'change_feed', rows: '105', bytes: '147456' },
]
const DATABASE = [{ size: '10344127', connections: '3', max: '100' }]
const CASES = [
  { status: 'respond', is_demo: false, count: '4' },
  { status: 'recover', is_demo: true, count: '6' },
  { status: 'closed', is_demo: false, count: '2' },
]
const ACCOUNTS = [
  { role: 'admin', count: '1' },
  { role: 'analyst', count: '2' },
]

describe('what the install is holding', () => {
  it('reports the tables with rows in them, largest first', async () => {
    const { db } = scripted([TABLES, DATABASE, CASES, ACCOUNTS])
    const read = await readAs(db)

    expect(read.tables[0]).toEqual({ name: 'timeline', approximateRows: 183, bytes: 147456 })
    expect(read.tables).toHaveLength(2)
  })

  /**
   * **Demo cases are counted apart, not folded in.** A fresh install is almost
   * entirely demonstration content, so a single total says the install is busy
   * when it is empty - the number an operator wants is how much of this is
   * theirs.
   */
  it('separates the analyst\u2019s own cases from the demos', async () => {
    const { db } = scripted([TABLES, DATABASE, CASES, ACCOUNTS])
    const read = await readAs(db)

    expect(read.cases).toEqual({ total: 12, live: 10, postIncident: 0, closed: 2, demo: 6 })
  })

  /**
   * **The same property without a hand-written answer.** The case above pins
   * one arithmetic result, so it detects a change and cannot say the figures
   * are consistent for any other install. These hold whatever the rows are:
   * every case is open or closed, and the demonstration content is a subset
   * rather than a separate population added on.
   *
   * That second one is what the requirement is actually about -- an operator
   * reading `total` has to be able to reach the number that is theirs, and
   * `total - demo` is only that if the two count the same cases.
   */
  it.each([
    ['a fresh install, mostly demos', CASES],
    ['no demonstration content at all', [{ status: 'respond', is_demo: false, count: '9' }]],
    ['nothing but demonstration content', [{ status: 'respond', is_demo: true, count: '7' }]],
    [
      'both kinds, both states',
      [
        { status: 'respond', is_demo: false, count: '3' },
        { status: 'recover', is_demo: true, count: '5' },
        { status: 'post-incident', is_demo: false, count: '4' },
        { status: 'closed', is_demo: false, count: '11' },
        { status: 'closed', is_demo: true, count: '2' },
      ],
    ],
  ])('conserves the case counts for %s', async (_name, rows) => {
    const { db } = scripted([TABLES, DATABASE, rows, ACCOUNTS])
    const { cases } = await readAs(db)

    expect(
      cases.live + cases.postIncident + cases.closed,
      'a case is in none of the three buckets, or in more than one',
    ).toBe(cases.total)
    expect(
      cases.demo,
      'more cases are demonstration content than exist, so `demo` counts a different ' +
        'population from `total` and subtracting one from the other means nothing',
    ).toBeLessThanOrEqual(cases.total)
  })

  it('reports the accounts by role, so an install with no admin is visible', async () => {
    const { db } = scripted([TABLES, DATABASE, CASES, ACCOUNTS])
    const read = await readAs(db)

    expect(read.accounts).toEqual({ total: 3, admins: 1, analysts: 2 })
  })

  /**
   * **The connection count is against its ceiling, because alone it says
   * nothing.** Three connections is unremarkable at a limit of 100 and an
   * emergency at a limit of 4.
   */
  it('reports connections against the ceiling they are measured from', async () => {
    const { db } = scripted([TABLES, DATABASE, CASES, ACCOUNTS])
    const read = await readAs(db)

    expect(read.database).toEqual({
      sizeBytes: 10344127,
      connections: 3,
      maxConnections: 100,
      where: 'this machine',
    })
  })

  /**
   * **A role nobody has must read zero rather than be absent.** The screen
   * draws a figure per role; an install with no admin left is the one state
   * this number exists to make visible, and a missing key would draw nothing
   * at all.
   */
  it('answers zero for a role no account holds', async () => {
    const { db } = scripted([TABLES, DATABASE, CASES, [{ role: 'analyst', count: '2' }]])
    const read = await readAs(db)

    expect(read.accounts).toEqual({ total: 2, admins: 0, analysts: 2 })
  })

  /** An empty install answers zeroes, not a crash and not an absent field. */
  it('answers a fresh install without inventing anything', async () => {
    const { db } = scripted([[], [], [], []])
    const read = await readAs(db)

    expect(read.tables).toEqual([])
    expect(read.cases).toEqual({ total: 0, live: 0, postIncident: 0, closed: 0, demo: 0 })
    expect(read.accounts).toEqual({ total: 0, admins: 0, analysts: 0 })
    expect(read.database).toEqual({
      sizeBytes: 0,
      connections: 0,
      maxConnections: 0,
      where: 'this machine',
    })
    // The cache is reported the same way, and from its own URL.
    expect(read.redis).toEqual({ where: 'this machine' })
  })
})
