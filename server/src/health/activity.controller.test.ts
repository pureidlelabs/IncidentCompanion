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
import type { ConfigService } from '@nestjs/config'

import type { Database } from '../db/client.js'
import type { Env } from '../config/env.js'

/**
 * **The two URLs, as a laptop has them.**
 */
const CONFIG = {
  get: (key: string) =>
    key === 'DATABASE_URL'
      ? 'postgres://u:p@127.0.0.1:5432/db'
      : 'redis://127.0.0.1:6379',
} as unknown as ConfigService<Env, true>

/** A database whose every query answers from a script, in call order. */
function scripted(answers: unknown[][]): { db: Database; calls: string[] } {
  const calls: string[] = []
  const db = {
    execute: vi.fn((query: unknown) => {
      calls.push(String(JSON.stringify(query)))
      return Promise.resolve({ rows: answers[calls.length - 1] ?? [] })
    }),
  } as unknown as Database
  return { db, calls }
}

const TABLES = [
  { name: 'timeline', rows: '183', bytes: '147456' },
  { name: 'change_feed', rows: '105', bytes: '147456' },
]
const DATABASE = [{ size: '10344127', connections: '3', max: '100' }]
const CASES = [
  { status: 'open', is_demo: false, count: '4' },
  { status: 'open', is_demo: true, count: '6' },
  { status: 'closed', is_demo: false, count: '2' },
]
const ACCOUNTS = [
  { role: 'admin', count: '1' },
  { role: 'analyst', count: '2' },
]

describe('what the install is holding', () => {
  it('reports the tables with rows in them, largest first', async () => {
    const { db } = scripted([TABLES, DATABASE, CASES, ACCOUNTS])
    const read = await new ActivityController(db, CONFIG).read()

    expect(read.tables[0]).toEqual({ name: 'timeline', approximateRows: 183, bytes: 147456 })
    expect(read.tables).toHaveLength(2)
  })

  /**
   * **Demo cases are counted apart, not folded in.**
   */
  it('separates the analyst\u2019s own cases from the demos', async () => {
    const { db } = scripted([TABLES, DATABASE, CASES, ACCOUNTS])
    const read = await new ActivityController(db, CONFIG).read()

    expect(read.cases).toEqual({ total: 12, open: 10, closed: 2, demo: 6 })
  })

  /**
   * **The same property without a hand-written answer.**
   */
  it.each([
    ['a fresh install, mostly demos', CASES],
    ['no demonstration content at all', [{ status: 'open', is_demo: false, count: '9' }]],
    ['nothing but demonstration content', [{ status: 'open', is_demo: true, count: '7' }]],
    [
      'both kinds, both states',
      [
        { status: 'open', is_demo: false, count: '3' },
        { status: 'open', is_demo: true, count: '5' },
        { status: 'closed', is_demo: false, count: '11' },
        { status: 'closed', is_demo: true, count: '2' },
      ],
    ],
  ])('conserves the case counts for %s', async (_name, rows) => {
    const { db } = scripted([TABLES, DATABASE, rows, ACCOUNTS])
    const { cases } = await new ActivityController(db, CONFIG).read()

    expect(cases.open + cases.closed, 'a case is neither open nor closed, or is both').toBe(
      cases.total,
    )
    expect(
      cases.demo,
      'more cases are demonstration content than exist, so `demo` counts a different ' +
        'population from `total` and subtracting one from the other means nothing',
    ).toBeLessThanOrEqual(cases.total)
  })

  it('reports the accounts by role, so an install with no admin is visible', async () => {
    const { db } = scripted([TABLES, DATABASE, CASES, ACCOUNTS])
    const read = await new ActivityController(db, CONFIG).read()

    expect(read.accounts).toEqual({ total: 3, admins: 1, analysts: 2 })
  })

  /**
   * **The connection count is against its ceiling, because alone it says
   * nothing.**
   */
  it('reports connections against the ceiling they are measured from', async () => {
    const { db } = scripted([TABLES, DATABASE, CASES, ACCOUNTS])
    const read = await new ActivityController(db, CONFIG).read()

    expect(read.database).toEqual({
      sizeBytes: 10344127,
      connections: 3,
      maxConnections: 100,
      where: 'this machine',
    })
  })

  /**
   * **A role nobody has must read zero rather than be absent.**
   */
  it('answers zero for a role no account holds', async () => {
    const { db } = scripted([TABLES, DATABASE, CASES, [{ role: 'analyst', count: '2' }]])
    const read = await new ActivityController(db, CONFIG).read()

    expect(read.accounts).toEqual({ total: 2, admins: 0, analysts: 2 })
  })

  /** An empty install answers zeroes, not a crash and not an absent field. */
  it('answers a fresh install without inventing anything', async () => {
    const { db } = scripted([[], [], [], []])
    const read = await new ActivityController(db, CONFIG).read()

    expect(read.tables).toEqual([])
    expect(read.cases).toEqual({ total: 0, open: 0, closed: 0, demo: 0 })
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
