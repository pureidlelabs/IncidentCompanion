/**
 * Every operation the authentication library defines, asked for over HTTP by
 * every kind of caller, answers as a path that never existed unless the
 * install offers it.
 *
 * **The operations are read off the running instance**, so a library release
 * that adds one is probed the day it lands rather than the day somebody adds a
 * line here. `OFFERED` is named rather than imported: a test reading the
 * allowlist it checks agrees with whatever the allowlist says.
 */
import { AuthService } from '@thallesp/nestjs-better-auth'
import { getEndpoints } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Auth } from '../src/auth/auth.config.js'
import type { Database } from '../src/db/client.js'
import { DATABASE } from '../src/db/db.module.js'
import { user } from '../src/db/schema/index.js'
import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'

/** What the install offers: signing in and out, and an analyst's own sessions. */
const OFFERED = [
  'GET /get-session',
  'GET /list-sessions',
  'POST /revoke-other-sessions',
  'POST /revoke-session',
  'POST /sign-in/email',
  'POST /sign-out',
]

/** What a held account may still do: find out who it is, sign in, and leave. */
const WAY_OUT = ['GET /get-session', 'POST /sign-in/email', 'POST /sign-out']

const ISSUED = 'surface-issued-password-1234'
const CHOSEN = 'surface-chosen-password-1234'
const TAG = `${String(process.pid)}-${String(Date.now() % 100_000)}`

let harness: Harness
let db: Database
let admin: Persona
let analyst: Persona
let held: Persona
/** The admin's display name, which the analyst tries to take. */
let adminName: string

interface Answer {
  status: number
  body: string
}

async function ask(path: string, method: string, cookie?: string): Promise<Answer> {
  const answer = await fetch(`${harness.base}${path}`, {
    method,
    headers: {
      origin: harness.base,
      ...(cookie ? { cookie } : {}),
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
    },
    ...(method === 'GET' ? {} : { body: '{}' }),
    redirect: 'manual',
  })
  return { status: answer.status, body: await answer.text() }
}

const same = (one: Answer, other: Answer) => one.status === other.status && one.body === other.body

/**
 * Every method and path the instance defines, as `METHOD /path`.
 *
 * **Read through `getEndpoints` rather than `instance.api`**, because the app
 * replaces `getSession` on the instance it mounts with a function that has no
 * path, and that route would silently leave the sweep.
 */
async function defined(): Promise<string[]> {
  const auth = harness.app.get<AuthService<Auth>>(AuthService).instance
  const { api } = getEndpoints(
    auth.$context as unknown as Parameters<typeof getEndpoints>[0],
    auth.options,
  )
  const found = new Set<string>()
  for (const endpoint of Object.values(api)) {
    const { path, options } = endpoint as { path?: string; options?: { method?: unknown } }
    if (!path) continue
    const methods = [options?.method ?? 'GET'].flat().map(String)
    for (const method of methods.flatMap((one) => (one === '*' ? ['GET', 'POST'] : [one]))) {
      found.add(`${method} ${path.replace(/:[A-Za-z]+/g, 'x')}`)
    }
  }
  return [...found].sort()
}

/**
 * The operations one caller is answered as anything but a path that never
 * existed. `fresh` signs the caller in again for each probe, so an operation
 * that ends a session ends a spare one.
 */
async function servedTo(fresh: (() => Promise<string>) | null): Promise<string[]> {
  const never = {
    GET: await ask('/api/auth/nothing-the-library-defines', 'GET'),
    POST: await ask('/api/auth/nothing-the-library-defines', 'POST'),
  }
  const served: string[] = []
  for (const operation of await defined()) {
    const [method, path] = operation.split(' ') as [string, string]
    const answer = await ask(`/api/auth${path}`, method, fresh ? await fresh() : undefined)
    const absent = never[method as keyof typeof never]
    if (!absent || !same(answer, absent)) served.push(operation)
  }
  return served
}

describe.skipIf(!(await bootable()))('the authentication library, over HTTP', () => {
  beforeAll(async () => {
    harness = await boot()
    db = harness.app.get<Database>(DATABASE)
    admin = await sharedAdmin(harness)
    const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, admin.id))
    adminName = row!.name

    const make = async (label: string): Promise<string> => {
      const email = `surface-${label}-${TAG}@harness.test`
      const made = await fetch(`${harness.base}/api/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify({
          username: email,
          displayName: `Surface ${label}`,
          password: ISSUED,
          role: 'analyst',
        }),
      })
      expect(made.ok, `making the ${label} account answered ${String(made.status)}`).toBe(true)
      return email
    }

    const working = await make('analyst')
    const issued = await signIn(harness, working, ISSUED)
    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: issued.cookie },
      body: JSON.stringify({ current: ISSUED, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(changed.status).toBe(200)
    analyst = await signIn(harness, working, CHOSEN)
    held = await signIn(harness, await make('held'), ISSUED)
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('defines more than it offers, or there is nothing to refuse', async () => {
    const all = await defined()
    expect(all).toEqual(expect.arrayContaining(OFFERED))
    expect(all.length).toBeGreaterThan(OFFERED.length)
  })

  it('serves an anonymous caller only what the install offers', async () => {
    expect(await servedTo(null)).toEqual(OFFERED)
  }, 60_000)

  it('serves an analyst only what the install offers', async () => {
    expect(
      await servedTo(async () => (await signIn(harness, analyst.email, CHOSEN)).cookie),
    ).toEqual(OFFERED)
  }, 120_000)

  it('serves an administrator only what the install offers', async () => {
    expect(await servedTo(async () => (await signIn(harness, admin.email)).cookie)).toEqual(OFFERED)
  }, 120_000)

  it('serves a held account only its way out', async () => {
    expect(await servedTo(async () => (await signIn(harness, held.email, ISSUED)).cookie)).toEqual(
      OFFERED,
    )

    for (const operation of OFFERED) {
      const [method, path] = operation.split(' ') as [string, string]
      const answer = await ask(
        `/api/auth${path}`,
        method,
        (await signIn(harness, held.email, ISSUED)).cookie,
      )
      const refused = answer.status === 403 && answer.body.includes('"mustChangePassword":true')
      expect(
        refused,
        `${operation} answered a held account ${String(answer.status)} ${answer.body.slice(0, 120)}`,
      ).toBe(!WAY_OUT.includes(operation))
    }
  }, 120_000)

  /**
   * An administrator reading another account through the library, by the path
   * and by every spelling of it that could reach the same route.
   */
  it('answers no spelling of an operation it does not offer', async () => {
    const query = `?id=${analyst.id}`
    const spellings = [
      `/api/auth/admin/get-user${query}`,
      `/api/auth/admin/get-user/${query}`,
      `/api/auth//admin/get-user${query}`,
      `/api/auth/admin%2Fget-user${query}`,
      `/api/auth/admin/get%2Duser${query}`,
      `/API/auth/admin/get-user${query}`,
      `/api/Auth/admin/get-user${query}`,
    ]
    const cookie = (await signIn(harness, admin.email)).cookie
    for (const spelling of spellings) {
      const answer = await ask(spelling, 'GET', cookie)
      expect(answer.status, `${spelling} answered ${answer.body.slice(0, 120)}`).toBe(404)
      expect(answer.body).not.toContain(analyst.email)
    }
  }, 60_000)

  it("does not let an analyst take another account's name", async () => {
    const cookie = (await signIn(harness, analyst.email, CHOSEN)).cookie
    for (const path of ['/api/auth/update-user', '/api/auth/admin/update-user']) {
      const renamed = await fetch(`${harness.base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie, origin: harness.base },
        body: JSON.stringify({ name: adminName, userId: analyst.id, data: { name: adminName } }),
      })
      expect(renamed.status, `${path} answered ${String(renamed.status)}`).toBe(404)
    }
    const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, analyst.id))
    expect(row!.name).toBe('Surface analyst')
  })
})
