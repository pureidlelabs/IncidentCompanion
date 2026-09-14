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

  /**
   * **The audit records the account, not the keystrokes.** `target_label` is a
   * copied address rather than a join, and the table is append-only -- so a
   * line naming a spelling no row holds cannot be corrected, and an auditor
   * filtering for that account never sees it. Nothing else guarantees it: the
   * route is reached by whatever spelling the address bar carries.
   */
  it('names the account in the audit by the address the install holds', async () => {
    const db = await pool()
    try {
      const { rows } = await db.query<{ target_label: string }>(
        `select target_label from install_activity
           where lower(target_label) = lower($1) order by at asc`,
        [TYPED],
      )

      expect(rows.length, 'the four acts above wrote no audit line at all').toBeGreaterThan(0)
      expect(
        rows.map((one) => one.target_label).filter((one) => one !== STORED),
        'an audit line names a spelling no account holds, and the table cannot be corrected',
      ).toEqual([])
    } finally {
      await db.end()
    }
  })

  /**
   * **The refusal the create route no longer reads for.** It holds no
   * duplicate check of its own: two administrators pressing Create at the same
   * moment both see no such account, so the database's complaint is the
   * answer, and `duplicateEmail` turns it into a sentence. Nothing exercised
   * that path, so it asserted a chain through three library internals.
   */
  it('refuses a second account for an address already held, in either spelling', async () => {
    const again = async (spelling: string) =>
      fetch(`${harness.base}/api/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify({
          username: spelling,
          displayName: 'Mixed Case Again',
          password: ISSUED,
          role: 'analyst',
        }),
      })

    const same = await again(STORED)
    expect(same.status, 'a duplicate was created rather than refused').toBe(422)
    expect(await same.text()).toContain('already an account')

    const capitalised = await again(TYPED)
    expect(
      capitalised.status,
      'a second spelling of a held address was created, so one address named two accounts',
    ).toBe(422)
  })

  /**
   * **The race the create route is designed around**, rather than the
   * sequential duplicate above. Both requests read no such account and both
   * proceed; only the database can decide between them, and what the loser is
   * told has to be the refusal rather than a 500.
   */
  it('produces one account when two administrators create it at the same moment', async () => {
    const racing = `Raced.${String(Date.now())}@Example.Invalid`
    const create = () =>
      fetch(`${harness.base}/api/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify({
          username: racing,
          displayName: 'Raced',
          password: ISSUED,
          role: 'analyst',
        }),
      })

    const [first, second] = await Promise.all([create(), create()])
    const statuses = [first.status, second.status].sort()

    const db = await pool()
    try {
      const { rows } = await db.query<{ n: string }>(
        'select count(*) as n from "user" where lower(email) = lower($1)',
        [racing],
      )
      expect(rows[0]?.n, 'the race left more than one account for one address').toBe('1')
    } finally {
      const cleanup = await pool()
      try {
        await cleanup.query(
          'delete from "session" where user_id in (select id from "user" where lower(email) = lower($1))',
          [racing],
        )
        await cleanup.query(
          'delete from "account" where user_id in (select id from "user" where lower(email) = lower($1))',
          [racing],
        )
        await cleanup.query('delete from "user" where lower(email) = lower($1)', [racing])
      } finally {
        await cleanup.end()
      }
      await db.end()
    }

    expect(
      statuses,
      'the loser of the race was answered with something other than the refusal',
    ).toEqual([201, 422])
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
