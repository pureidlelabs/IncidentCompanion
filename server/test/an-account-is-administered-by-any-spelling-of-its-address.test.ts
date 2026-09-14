/**
 * Every account route reaches the account its address names, whatever case the
 * administrator typed.
 *
 * Better Auth folds the address it stores, so the row is lower-cased whatever
 * the create form was given. The four single-account routes resolved their
 * target by scanning the roster with a JavaScript `===`, so an administrator
 * who typed one capital was told `No account for ...` -- while the password
 * hold and the lockout clear called two lines later, both matching folded,
 * would have found the row. One request, two halves, disagreeing. -> #632
 *
 * **Driven through the booted app**, because the defect is what the route
 * answers rather than what a service returns, and the scan it replaces was in
 * the controller.
 *
 * **What this does not cover:** that an address names one row, which is
 * `auth/an-address-names-one-account-whatever-its-case.test.ts` against the
 * constraint, and what each route then does to the account it found, which is
 * each route's own test.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

/** Typed with capitals; stored folded. Both name one account. */
const TYPED = `Mixed.Case.${String(Date.now())}@Example.Invalid`
const STORED = TYPED.toLowerCase()
const ISSUED = 'issued-by-an-admin-for-the-case-test'

async function pool() {
  const { Pool } = await import('pg')
  return new Pool({ connectionString: process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL })
}

describe.skipIf(!runnable)('an account named by a differently cased address', () => {
  let harness: Harness
  let admin: Persona

  /** The route, called with the capitalised spelling of a folded row. */
  const asAdmin = (path: string, body?: unknown) =>
    fetch(`${harness.base}/api/accounts/${encodeURIComponent(TYPED)}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify(body ?? {}),
    })

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    const created = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: STORED,
        displayName: 'Mixed Case',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    expect(created.ok, await created.text()).toBe(true)
  }, 90_000)

  afterAll(async () => {
    const db = await pool()
    try {
      await db.query(
        'delete from "session" where user_id in (select id from "user" where lower(email) = lower($1))',
        [TYPED],
      )
      await db.query(
        'delete from "account" where user_id in (select id from "user" where lower(email) = lower($1))',
        [TYPED],
      )
      await db.query('delete from "user" where lower(email) = lower($1)', [TYPED])
    } finally {
      await db.end()
    }
    await harness?.close()
  })

  /**
   * **Ordered, because three of the four change the account's state.** The
   * reset is first so the disable has something to disable, and the enable
   * follows the disable so it has something to undo.
   */
  it('is reset, disabled, enabled and re-roled by the spelling the admin typed', async () => {
    const reset = await asAdmin('reset', { password: 'another-password-an-admin-chose' })
    expect(
      reset.status,
      'the reset refused an account it holds, so the roster scan and the folded write disagreed',
    ).toBe(200)

    const disabled = await asAdmin('disable')
    expect(disabled.status, await disabled.text()).toBe(200)

    const enabled = await asAdmin('enable')
    expect(enabled.status, await enabled.text()).toBe(200)

    const roled = await asAdmin('role', { role: 'admin' })
    expect(roled.status, await roled.text()).toBe(200)
  })

  /** An address no account holds is still refused, in either spelling. */
  it('is still refused where no account holds the address', async () => {
    const nobody = await fetch(
      `${harness.base}/api/accounts/${encodeURIComponent('No.Such.Person@example.invalid')}/enable`,
      { method: 'POST', headers: { cookie: admin.cookie } },
    )

    expect(nobody.status).toBe(422)
  })
})
