/**
 * A session whose account no longer exists reaches no case, the default
 * customer's included.
 *
 * The account row is deleted the way the app's own role can delete it, which
 * leaves the cached session the guard serves. Every account reaches the
 * default customer by holding an account, so an identity with none reaches it
 * by nothing.
 */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ReachService } from '../src/access/reach.service.js'
import type { Database } from '../src/db/client.js'
import { DATABASE } from '../src/db/db.module.js'
import { user } from '../src/db/schema/index.js'
import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'

const ISSUED = 'gone-issued-password-1234'
const CHOSEN = 'gone-chosen-password-1234'

let harness: Harness
let db: Database
let gone: Persona
let caseId: string

describe.skipIf(!(await bootable()))('an identity the install does not hold', () => {
  beforeAll(async () => {
    harness = await boot()
    db = harness.app.get<Database>(DATABASE)
    const admin = await sharedAdmin(harness)
    const email = `gone-${String(Date.now())}@harness.test`
    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: email,
        displayName: 'Gone',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    expect(made.ok).toBe(true)
    const issued = await signIn(harness, email, ISSUED)
    await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: issued.cookie },
      body: JSON.stringify({ current: ISSUED, password: CHOSEN, repeat: CHOSEN }),
    })
    gone = await signIn(harness, email, CHOSEN)

    const opened = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: gone.cookie },
      body: JSON.stringify({ title: 'Opened by an account that is about to go' }),
    })
    expect(opened.status).toBe(201)
    caseId = ((await opened.json()) as { id: string }).id
    expect(
      (await fetch(`${harness.base}/api/cases/${caseId}`, { headers: { cookie: gone.cookie } }))
        .status,
      'the case was not reachable to begin with',
    ).toBe(200)

    await db.delete(user).where(eq(user.id, gone.id))
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('is refused a case on the default customer', async () => {
    const answer = await fetch(`${harness.base}/api/cases/${caseId}`, {
      headers: { cookie: gone.cookie },
    })
    expect(answer.status).toBe(404)
  })

  it('lists no case', async () => {
    const answer = await fetch(`${harness.base}/api/cases`, { headers: { cookie: gone.cookie } })
    const listed = answer.ok ? JSON.stringify(await answer.json()) : ''
    expect(listed).not.toContain(caseId)
  })

  it('is granted nothing by the reach resolution', async () => {
    const reach = harness.app.get(ReachService)
    const nobody = randomUUID()
    const fallback = await reach.defaultCustomerId()
    expect(fallback).not.toBeNull()
    expect(await reach.levelFor(nobody, fallback!)).toBeNull()
    expect(await reach.customersReachedBy(nobody)).toEqual([])
  })
})
