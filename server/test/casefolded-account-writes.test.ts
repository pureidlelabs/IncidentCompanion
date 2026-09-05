/**
 * That the writes an admin action makes against the user row reach the row,
 * whatever case the address was typed in.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

/** Capitalised on purpose: what the admin types, not what the table stores. */
const TYPED = 'Case.Folded@Example.Invalid'
const STORED = TYPED.toLowerCase()
const ISSUED = 'issued-by-an-admin-1'

async function pool() {
  const { Pool } = await import('pg')
  return new Pool({ connectionString: process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL })
}

async function heldRow(): Promise<{ email: string; must: boolean } | null> {
  const db = await pool()
  try {
    const { rows } = await db.query<{ email: string; must_change_password: boolean }>(
      'select email, must_change_password from "user" where lower(email) = lower($1)',
      [TYPED],
    )
    const [row] = rows
    return row ? { email: row.email, must: row.must_change_password } : null
  } finally {
    await db.end()
  }
}

describe.skipIf(!runnable)('an account created with a capitalised address', () => {
  let harness: Harness
  let admin: Persona

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    const db = await pool()
    try {
      await db.query(
        'delete from "session" where user_id in (select id from "user" where lower(email) = lower($1))',
        [TYPED],
      )
      await db.query('delete from "account" where user_id in (select id from "user" where lower(email) = lower($1))', [
        TYPED,
      ])
      await db.query('delete from "user" where lower(email) = lower($1)', [TYPED])
    } finally {
      await db.end()
    }
    await harness?.close()
  })

  it('owes its own password, and is refused until it sets one', async () => {
    const created = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: TYPED,
        displayName: 'Case Folded',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    expect(created.ok, await created.text()).toBe(true)

    // The premise: the row exists and its address is folded, so a write keyed
    // on the typed spelling addresses nothing.
    const row = await heldRow()
    expect(row, 'the account was created').not.toBeNull()
    expect(row!.email, 'Better Auth folds the address it stores').toBe(STORED)

    expect(row!.must, 'the hold reached the row the create wrote').toBe(true)

    // And the hold is what the analyst meets, not just a column.
    const analyst = await signIn(harness, STORED, ISSUED)
    const anywhere = await fetch(`${harness.base}/api/cases`, {
      headers: { cookie: analyst.cookie },
    })
    expect(anywhere.status, 'held accounts are refused until they set a password').toBe(403)
  })
})
