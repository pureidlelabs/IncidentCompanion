/**
 * That the clause is reachable through the real door, not only through a
 * request a fixture built.
 *
 * **The guard's own cases hand it `session: { user: { id, role } }`.** That
 * proves the logic and cannot prove the shape: if the running server does not
 * carry a role at that path, the clause never fires, every case here still
 * passes, and the feature ships inert. It fails closed, so this is a
 * correctness gap rather than a hole -- and an inert grant is invisible until
 * somebody needs it.
 *
 * **A fresh administrator, because the shared one is granted `delete` by
 * another file.** `grantsItselfDelete` puts the default customer in a group and
 * joins the shared admin at `delete`, which is the path this clause exists to
 * skip -- so running against that account would pass whether or not the clause
 * is there. The account below holds no group, which is the whole premise.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'

const RUNNABLE = await bootable()

/** What the creating administrator sets, and what this account replaces it with. */
const ISSUED = 'harness-issued-1234'
const OWN = 'harness-chosen-5678'

describe.skipIf(!RUNNABLE)('an administrator holding no group', () => {
  let harness: Harness
  let admin: Persona

  beforeAll(async () => {
    harness = await boot()

    // **Created through the door an install really has.** Sign-up closes once
    // the install holds an account, in process as well as over HTTP, so the
    // only way to a second administrator is an existing one making them.
    const existing = await sharedAdmin(harness)
    const email = `admin-no-group-${String(Date.now())}@example.invalid`
    const created = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: existing.cookie },
      body: JSON.stringify({
        username: email,
        displayName: 'Administrator in no group',
        password: ISSUED,
        role: 'admin',
      }),
    })
    if (!created.ok) {
      throw new Error(`creating the administrator answered ${String(created.status)}`)
    }

    // A created account arrives holding a password somebody else chose and
    // reaches `/api/change-password` and nothing else until it replaces it.
    const held = await signIn(harness, email, ISSUED)
    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: held.cookie },
      body: JSON.stringify({ current: ISSUED, password: OWN, repeat: OWN }),
    })
    if (!changed.ok) {
      throw new Error(`the administrator could not set its own password: ${String(changed.status)}`)
    }

    admin = await signIn(harness, email, OWN)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * **The premise, asserted rather than assumed.** A session that carries no
   * role would make the case below fail for a reason that looks like the
   * clause being wrong.
   */
  it('holds a session that says it is an administrator', () => {
    expect(admin.role).toBe('admin')
  })

  it('deletes a case nobody has attributed', async () => {
    const made = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ title: `Nobody has said whose ${String(Date.now())}` }),
    })
    expect(made.status, 'the case was not opened, so the delete proves nothing').toBe(201)
    const { id } = (await made.json()) as { id: string }

    const removed = await fetch(`${harness.base}/api/cases/${id}`, {
      method: 'DELETE',
      headers: { cookie: admin.cookie },
    })

    expect(removed.ok, `deleting answered ${String(removed.status)}`).toBe(true)
  }, 90_000)
})
