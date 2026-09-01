/**
 * That signing in is recorded, driven through the endpoint rather than the writer.
 *
 * **The gap this fills.** `install-audit/read.test.ts` writes `sign_in_failed`
 * rows itself, as fixtures for paging and severity, so nothing anywhere
 * asserted that an actual sign-in produces one. The writer and the route both
 * passed their own tests while the hook between them was never exercised.
 *
 * **And the hook is the fragile part.** Both lines come from Better Auth's own
 * middleware -- `after` on `/sign-in` for the failure, and the session-creation
 * hook for the success -- neither of which is one of this app's routes. No
 * guard, pipe or interceptor of ours runs there, so a rename upstream removes
 * the line and nothing else changes.
 *
 * **Its own account, never a shared one.** A wrong password advances the
 * lockout counter, and borrowing `sharedAnalyst` would shut an account other
 * files are signing in with -- failing them in a way that reads as their own
 * defect.
 */
import { and, desc, eq, gte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness } from './app-harness.js'
import { openTestPool } from './database.js'
import { installActivity } from '../src/db/schema/install-activity.js'

const RUNNABLE = await bootable()

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

describe.skipIf(!RUNNABLE || !db)('signing in leaves a line', () => {
  let harness: Harness
  let email: string
  let userId: string

  const PASSWORD = 'sign-in-line-password-1234'
  const ISSUED = 'issued-sign-in-line-1234'

  /** The newest line of one event naming this account, or undefined. */
  async function newest(event: 'signed_in' | 'sign_in_failed', since: Date) {
    const [row] = await db!
      .select()
      .from(installActivity)
      .where(and(eq(installActivity.event, event), gte(installActivity.at, since)))
      .orderBy(desc(installActivity.at))
      .limit(20)
      .then((rows) =>
        rows.filter((one) => one.actorId === userId || one.targetLabel === email),
      )
    return row
  }

  beforeAll(async () => {
    harness = await boot()
    email = `sign-in-line-${process.pid}@harness.test`

    // Sign-up closes once an install has an administrator, so an account
    // arrives through the door an administrator uses, holding a password
    // somebody else chose.
    const admin = await sharedAdmin(harness)
    const created = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: email,
        displayName: 'Sign-in line harness',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    if (!created.ok) {
      throw new Error(`creating this file's analyst answered ${created.status}`)
    }

    const held = await signIn(harness, email, ISSUED)
    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: held.cookie },
      body: JSON.stringify({ current: ISSUED, password: PASSWORD, repeat: PASSWORD }),
    })
    if (!changed.ok) throw new Error(`the analyst could not set its own password: ${changed.status}`)

    const [who] = await db!
      .select()
      .from(installActivity)
      .where(eq(installActivity.targetLabel, email))
      .limit(1)
    userId = (who?.actorId as string | null) ?? ''
    if (!userId) {
      const session = await fetch(`${harness.base}/api/auth/get-session`, {
        headers: { cookie: held.cookie },
      })
      const body = (await session.json()) as { user?: { id?: string } } | null
      userId = body?.user?.id ?? ''
    }
    expect(userId, 'the harness could not find the account it just made').not.toBe('')
  })

  afterAll(async () => {
    await harness.close()
    await pool?.end()
  })

  it('records a successful sign-in against the account that made it', async () => {
    const since = new Date(Date.now() - 2_000)

    await signIn(harness, email, PASSWORD)

    const line = await newest('signed_in', since)
    expect(line, 'a sign-in succeeded and left no line').toBeDefined()
    expect(line!.actorId).toBe(userId)
    // *Who, when, and how* -- the channel is what a reader takes the stream by,
    // and `at` is stamped by the database rather than by the caller.
    expect(line!.channel).toBe('authentication')
    expect(line!.at.getTime()).toBeGreaterThanOrEqual(since.getTime())
  })

  /**
   * Two claims about one refusal, deliberately not two refusals.
   *
   * **The line names what was attempted**, or it answers nothing a reviewer
   * can act on. And **the attempted password is not in it**: a refusal has to
   * record what was tried, and the obvious way to write that is to record the
   * body -- which puts a password, usually a real one from another system,
   * into a table whose whole point is that it cannot be edited or deleted.
   * `record.ts` says the only guard this ever had was a grep for the word
   * `password`; this is that grep, aimed at the value rather than the key.
   *
   * **One attempt, because a failed sign-in is not free.** Every one advances
   * a lockout counter and spends a rate-limit budget the rest of the suite is
   * sharing, so a file that guesses twice to assert twice is charging the
   * suite for its own convenience.
   */
  it('records a refused sign-in, naming what was attempted and not what was typed', async () => {
    const since = new Date(Date.now() - 2_000)
    const secret = 'Sup3rSecret-From-Another-System'

    const refused = await fetch(`${harness.base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: secret }),
    })
    expect(refused.ok, 'the wrong password was accepted').toBe(false)

    const line = await newest('sign_in_failed', since)
    expect(line, 'a sign-in was refused and left no line').toBeDefined()
    expect(line!.targetLabel).toBe(email)
    expect(line!.channel).toBe('authentication')

    // **The whole row, not the columns a password was expected in.** The id is
    // a `bigserial` and serialises as a BigInt, hence the replacer -- without
    // it this throws rather than asserting, which is a red that says nothing.
    const stored = JSON.stringify(line, (_key, value: unknown) =>
      typeof value === 'bigint' ? String(value) : value,
    )
    expect(stored).not.toContain(secret)
  })
})
