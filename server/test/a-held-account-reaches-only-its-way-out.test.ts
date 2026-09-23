/**
 * An account that must change its password is refused every operation the
 * install publishes, except changing it and the way out.
 *
 * Swept over the published description, the authentication library's
 * operations included, with a real case standing in for every case id so a
 * refusal is the hold rather than the case being absent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, operations, sharedAdmin, signIn, type Harness } from './app-harness.js'

/** Changing the password, and the way out: who it is, signing in, signing out. */
const STILL_ANSWERED = [
  'GET /api/auth/get-session',
  'GET /api/health',
  'POST /api/auth/sign-in/email',
  'POST /api/auth/sign-out',
  'POST /api/change-password',
]

const ISSUED = 'held-way-out-password-1234'

let harness: Harness

describe.skipIf(!(await bootable()))('an account that must change its password', () => {
  beforeAll(async () => {
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('is refused everything else the install publishes', async () => {
    const admin = await sharedAdmin(harness)
    const email = `held-way-out-${String(Date.now())}@harness.test`
    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: email,
        displayName: 'Held',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    expect(made.ok).toBe(true)
    const opened = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ title: 'A case the held account may not open' }),
    })
    const caseId = ((await opened.json()) as { id: string }).id
    const held = await signIn(harness, email, ISSUED)

    const answered: string[] = []
    for (const one of operations(harness.document, { caseId })) {
      const answer = await fetch(`${harness.base}${one.path}`, {
        method: one.method,
        headers: { cookie: held.cookie, 'content-type': 'application/json', origin: harness.base },
        body: ['GET', 'DELETE'].includes(one.method) ? undefined : '{}',
      })
      if (answer.status !== 403) answered.push(`${one.method} ${one.template}`)
    }

    expect(answered.sort()).toEqual(STILL_ANSWERED)
  }, 120_000)
})
