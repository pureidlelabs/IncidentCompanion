/**
 * **The record of a deleted case does not live anywhere the deletion reaches.**
 */
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, describe, expect, it } from 'vitest'

import { openTestPool } from '../../test/database.js'

const URL_ = process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_seed') : null
const db = pool ? drizzle({ client: pool }) : null

/** Where a deletion record has to survive, and the table it must not hang off. */
const RECORD = 'install_activity'
const DELETED = 'cases'

interface Reference {
  child: string
  parent: string
  /** Postgres spells the delete action: `c` cascade, `n` set null, `a` no action. */
  on_delete: string
}

/** Every foreign key in the database, as the catalogue holds them. */
async function references(): Promise<Reference[]> {
  const found = await db!.execute(sql`
    select
      child.relname::text as child,
      parent.relname::text as parent,
      con.confdeltype::text as on_delete
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_class parent on parent.oid = con.confrelid
    where con.contype = 'f'
  `)
  return found.rows as unknown as Reference[]
}

describe.skipIf(!db)('the record of a deleted case', () => {
  afterAll(async () => {
    await pool!.end()
  })

  /**
   * The vacuity guard, and it is not decoration: written against
   * `information_schema` this file passed every case below while reading an
   * empty set, because the role it connects as owns nothing.
   */
  it('can see the references a delete would follow', async () => {
    const toTheCase = (await references()).filter((one) => one.parent === DELETED)

    expect(
      toTheCase.length,
      'no table references cases, which cannot be true of a case-scoped store -- ' +
        'this query is being answered by privilege rather than by the schema',
    ).toBeGreaterThan(10)
  })

  it('hangs off nothing that a deleted case takes with it', async () => {
    const reached = (await references())
      .filter((one) => one.child === RECORD && one.parent === DELETED)
      .map((one) => `${one.child} -> ${one.parent} (${one.on_delete})`)

    expect(
      reached,
      `${RECORD} references ${DELETED}, so deleting a case can reach the only record ` +
        'that says it existed -- which is the trace a deletion is not allowed to remove',
    ).toEqual([])
  })

  /**
   * The one reference it does carry is to the analyst, and it is `set null`:
   * deleting an account blanks the attribution and keeps the line.
   */
  it('is not cascaded away by anything else either', async () => {
    const cascading = (await references())
      .filter((one) => one.child === RECORD && one.on_delete === 'c')
      .map((one) => `${one.child} -> ${one.parent}`)

    expect(
      cascading,
      'these references cascade, so deleting the row at the other end destroys the ' +
        'audit line rather than orphaning it',
    ).toEqual([])
  })
})
