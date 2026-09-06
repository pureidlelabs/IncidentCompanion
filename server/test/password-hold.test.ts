/**
 * That a password hold reaches a session that is already open.
 *
 * The hold is read from the Redis session cache, so a write to the table alone
 * leaves an open session untouched. An administrator resetting a signed-in
 * analyst's password is the path where that shows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

const VICTIM = 'held-mid-session@example.invalid'
const FIRST = 'a-password-long-enough'
const CHOSEN = 'their-own-password-1'

async function pool() {
  const { Pool } = await import('pg')
  return new Pool({ connectionString: process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL })
}

describe.skipIf(!runnable)('a password reset on a signed-in analyst', () => {
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
        'delete from "session" where user_id in (select id from "user" where email = $1)',
        [VICTIM],
      )
      await db.query('delete from "user" where email = $1', [VICTIM])
    } finally {
      await db.end()
    }
    await harness?.close()
  })

  it('refuses the session that was already open', async () => {
    // Created by an administrator, so it arrives held, and then sets its own
    // password -- which releases the hold and is the ordinary first sign-in.
    const created = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: VICTIM,
        displayName: 'Held Mid Session',
        password: FIRST,
        role: 'analyst',
      }),
    })
    expect(created.ok, await created.text()).toBe(true)

    const analyst = await signIn(harness, VICTIM, FIRST)
    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: analyst.cookie },
      body: JSON.stringify({ current: FIRST, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(changed.ok, 'the account sets its own password first').toBe(true)

    const working = await fetch(`${harness.base}/api/cases`, { headers: { cookie: analyst.cookie } })
    expect(working.status, 'and is then an ordinary analyst').toBe(200)

    // The administrator resets it. The account is held again, and the analyst
    // is holding a cookie minted before that.
    const reset = await fetch(`${harness.base}/api/accounts/${VICTIM}/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ password: 'a-third-password-x' }),
    })
    expect(reset.ok, await reset.text()).toBe(true)

    const after = await fetch(`${harness.base}/api/cases`, { headers: { cookie: analyst.cookie } })
    expect(
      after.status,
      'the open session kept working, so the hold reached Postgres and nothing else',
    ).toBe(403)
  })
})
