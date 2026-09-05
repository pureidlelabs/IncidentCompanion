/**
 * That a password reset lifts the lockout it lands on top of, not just the
 * password.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LOCKOUT_AFTER_FAILURES } from '../src/policy/keys.js'
import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

const VICTIM = 'locked-out-by-reset@example.invalid'
const ORIGINAL = 'a-password-long-enough-1'
const REISSUED = 'a-second-password-abcde'

async function pool() {
  const { Pool } = await import('pg')
  return new Pool({ connectionString: process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL })
}

async function failSignIn(base: string, email: string): Promise<Response> {
  return fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'definitely-the-wrong-password' }),
  })
}

describe.skipIf(!runnable)('a password reset on a locked-out account', () => {
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

  it('signs in immediately after the reset, and the counter is zeroed rather than the window merely expiring', async () => {
    const created = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: VICTIM,
        displayName: 'Locked Out By Reset',
        password: ORIGINAL,
        role: 'analyst',
      }),
    })
    expect(created.ok, await created.text()).toBe(true)

    // Drive it to the lockout threshold with wrong-password attempts. The
    // account being "held" (owing its own password) is irrelevant here - a
    // sign-in attempt is checked against the credential, not the hold.
    for (let i = 0; i < LOCKOUT_AFTER_FAILURES; i++) {
      await failSignIn(harness.base, VICTIM)
    }

    // The account is genuinely locked now: even the *correct* original
    // password is refused, proving the lock rather than an unlucky guess.
    const stillLocked = await fetch(`${harness.base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: VICTIM, password: ORIGINAL }),
    })
    expect(stillLocked.ok, 'the correct password is refused while the account is locked').toBe(
      false,
    )

    // The administrator resets the password.
    const reset = await fetch(`${harness.base}/api/accounts/${VICTIM}/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ password: REISSUED }),
    })
    expect(reset.ok, await reset.text()).toBe(true)

    // The counter is zeroed, not merely "not yet locked again": read it back
    // from Postgres directly, rather than inferring it from a sign-in working.
    const db = await pool()
    let row: { failed_sign_ins: number; locked_until: Date | null }
    try {
      const result = await db.query<{ failed_sign_ins: number; locked_until: Date | null }>(
        'select failed_sign_ins, locked_until from "user" where email = $1',
        [VICTIM],
      )
      row = result.rows[0]!
    } finally {
      await db.end()
    }
    expect(row.failed_sign_ins, 'the failure counter is zeroed, not left standing').toBe(0)
    expect(row.locked_until, 'the lock is lifted, not merely unexpired').toBeNull()

    // And signs in immediately with the new password - no waiting out the
    // window.
    const signedIn = await fetch(`${harness.base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: VICTIM, password: REISSUED }),
    })
    expect(signedIn.ok, await signedIn.text()).toBe(true)
  })

  it('refuses the reset route to a non-admin', async () => {
    const analyst = await sharedAnalyst(harness)
    const attempt = await fetch(`${harness.base}/api/accounts/${VICTIM}/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: analyst.cookie },
      body: JSON.stringify({ password: 'whatever-an-analyst-might-try' }),
    })
    expect(attempt.status).toBe(403)
  })
})
