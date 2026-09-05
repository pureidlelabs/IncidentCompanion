/**
 * The whole server, booted, so a test can make a real request through it.
 *
 * **What this tier is for, and what it is not.** Every other test in this suite
 * reaches inside the composition - it constructs a controller and calls the
 * method. That is the right shape for a claim about *one* unit, and it cannot
 * see the request path that actually ships: validation pipe, then the auth
 * guard, then the case-access guard, then the handler, then the serializer
 * interceptor, then the wire format. A defect living in the seams between those
 * is invisible to a green suite and visible only in a browser.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { AuthService } from '@thallesp/nestjs-better-auth'
import type { Auth } from '../src/auth/auth.config.js'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { DATABASE } from '../src/db/db.module.js'
import type { Database } from '../src/db/client.js'
import { Socket } from 'node:net'
import { declined } from './must-run.js'
import type { OpenAPIObject } from '@nestjs/swagger'

/**
 * This worktree's stack, from the one script that derives it.
 */
function stackEnv(): Record<string, string> {
  return JSON.parse(
    execFileSync('node', [fileURLToPath(new URL('../scripts/stack.mjs', import.meta.url))], {
      encoding: 'utf8',
    }),
  ) as Record<string, string>
}

const REDIS = process.env.REDIS_URL ?? stackEnv()['redisUrl']!

/** Answers whether something is listening, without needing a client library. */
export function listening(host: string, port: number, ms = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    const done = (answer: boolean) => {
      socket.destroy()
      resolve(answer)
    }
    socket.setTimeout(ms)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

/**
 * Whether this machine can run the tier at all.
 */
export async function bootable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return declined('The server tier', 'DATABASE_URL names no database')
  }
  const url = new URL(REDIS)
  if (await listening(url.hostname, Number(url.port || 6379))) return true
  return declined('The server tier', `nothing is listening on ${url.host} for Redis`)
}

export interface Harness {
  app: INestApplication
  /** for example `http://127.0.0.1:53412` - the port is whatever was free. */
  base: string
  /** The reference this build publishes, used to enumerate the route table. */
  document: OpenAPIObject
  close(): Promise<void>
}

/**
 * A collaborator to replace while the app is booted.
 */
export interface Override {
  token: unknown
  value: unknown
}

/**
 * Boots the app on a free port, with the environment filled in first.
 */
export async function boot(overrides: Override[] = []): Promise<Harness> {
  process.env.REDIS_URL ??= REDIS
  process.env.AUTH_SECRET ??= 'harness-secret-that-is-long-enough-to-pass'
  process.env.AUTH_BASE_URL ??= 'http://127.0.0.1'

  const { AppModule } = await import('../src/app.module.js')
  const { openApiDocument } = await import('../src/openapi.js')

  let builder = Test.createTestingModule({ imports: [AppModule] })
  for (const { token, value } of overrides) {
    builder = builder.overrideProvider(token).useValue(value)
  }
  const moduleRef = await builder.compile()
  const app = moduleRef.createNestApplication<NestExpressApplication>()

  /**
   * **The same platform layer `main.ts` applies**, so the harness drives the
   * application that ships rather than a module graph that resembles it.
   */
  const { applyPlatform } = await import('../src/platform.js')
  applyPlatform(app)
  await app.init()
  // Port 0: the OS picks a free one, so concurrent runs never collide.
  await app.listen(0, '127.0.0.1')

  const base = (await app.getUrl()).replace('[::1]', '127.0.0.1')
  const document = openApiDocument(app)

  /**
   * **Mirrors what `main.ts` does after listening**, and it has to: without it
   * `/api/openapi.json` answers 404 here and 200 in the shipping app, so the
   * harness would report a route as absent that is merely unserved - the
   * class of difference this tier exists to eliminate.
   */
  const { OpenApiStore } = await import('../src/openapi.controller.js')
  app.get(OpenApiStore).set(document)

  /**
   * **The built-in library and language pack, because every real install has
   * them.**
   */
  const { LibraryService } = await import('../src/library/library.service.js')
  const { LanguageService } = await import('../src/report/language.service.js')
  await app.get(LibraryService, { strict: false }).seedBuiltIns()
  await app.get(LanguageService, { strict: false }).seedBuiltIn()

  return { app, base, document, close: () => app.close() }
}

/** What every harness account ends up holding, so any of them can sign back in. */
const HARNESS_PASSWORD = 'harness-password-1234'

export interface Persona {
  /** Ready to pass as a `cookie` header. */
  cookie: string
  role: string
  email: string
  /** The account's own id, which a grant has to name. */
  id: string
}

/**
 * Signs a new account up and returns its session.
 */
export async function signUp(
  harness: Harness,
  email: string,
  name = 'Harness',
): Promise<Persona> {
  /**
   * **In process, because `/sign-up/email` is not served.**
   */
  const auth = harness.app.get<AuthService<Auth>>(AuthService)
  await auth.api.signUpEmail({ body: { email, password: HARNESS_PASSWORD, name } })
  return signIn(harness, email)
}

/** Signs an existing account in, for a session that reflects its current role. */
export async function signIn(
  harness: Harness,
  email: string,
  password = HARNESS_PASSWORD,
): Promise<Persona> {
  const response = await fetch(`${harness.base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) {
    throw new Error(`sign-in for ${email} answered ${response.status}: ${await response.text()}`)
  }
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) throw new Error(`sign-in for ${email} issued no session cookie`)
  const body = (await response.json()) as { user?: { role?: string; id?: string } }
  return {
    cookie: setCookie.split(';')[0]!,
    role: body.user?.role ?? 'unknown',
    email,
    id: body.user?.id ?? '',
  }
}

/**
 * The two accounts the whole suite shares, and why there are exactly two.
 */
const SHARED = {
  admin: 'harness-admin@example.invalid',
  analyst: 'harness-analyst@example.invalid',
} as const

/** What an admin sets when creating the analyst, before the analyst replaces it. */
const ISSUED_PASSWORD = 'harness-issued-1234'

/**
 * The install's administrator, created once and signed into thereafter.
 *
 * **Sign-in first, sign-up only if that fails.** The suite shares one database
 * across the whole run, so by the second file this account already exists -
 * and after the first sign-up the door it came through is shut. Ordering the
 * two the other way makes every file after the first fail on a 403 that says
 * nothing about what it was testing.
 */
export async function sharedAdmin(harness: Harness): Promise<Persona> {
  const existing = await signIn(harness, SHARED.admin).catch(() => null)
  const account = existing ?? (await signUpShared(harness, SHARED.admin))
  if (account.role === 'admin') return account

  const { Pool } = await import('pg')
  const pool = new Pool({
    connectionString: process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL,
  })
  try {
    await pool.query('update "user" set role = $1 where email = $2', ['admin', SHARED.admin])
  } finally {
    await pool.end()
  }
  // Signed in again so the session carries the role it has now.
  return signIn(harness, SHARED.admin)
}

/**
 * **A race between test files is a sign-up that answers "already exists".**
 */
async function signUpShared(harness: Harness, email: string): Promise<Persona> {
  try {
    return await signUp(harness, email)
  } catch (why) {
    return signIn(harness, email).catch(() => {
      // **Both doors refused, so say what the first one said.** Reporting only
      // the sign-in failure names a missing account and hides the reason it was
      // never created, which is the half that explains the run.
      throw new Error(`the shared account ${email} could not be created: ${String(why)}`)
    })
  }
}

/**
 * An analyst, **created the way an install really creates one** - by an
 * administrator, through `POST /api/accounts`.
 */

export async function sharedAnalyst(harness: Harness): Promise<Persona> {
  const already = await signIn(harness, SHARED.analyst).catch(() => null)
  if (already && already.role !== 'unknown') return already

  const admin = await sharedAdmin(harness)
  const created = await fetch(`${harness.base}/api/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin.cookie },
    body: JSON.stringify({
      username: SHARED.analyst,
      displayName: 'Harness analyst',
      password: ISSUED_PASSWORD,
      role: 'analyst',
    }),
  })
  if (!created.ok) {
    throw new Error(`creating the shared analyst answered ${created.status}: ${await created.text()}`)
  }

  const held = await signIn(harness, SHARED.analyst, ISSUED_PASSWORD)
  const changed = await fetch(`${harness.base}/api/change-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: held.cookie },
    body: JSON.stringify({
      current: ISSUED_PASSWORD,
      password: HARNESS_PASSWORD,
      repeat: HARNESS_PASSWORD,
    }),
  })
  if (!changed.ok) {
    throw new Error(
      `the shared analyst could not set its own password: ${changed.status} ${await changed.text()}`,
    )
  }
  return signIn(harness, SHARED.analyst)
}

/**
 * Grants a persona `delete` over the default customer, through the routes an
 * administrator would use.
 */
export async function grantsItselfDelete(harness: Harness, who: Persona): Promise<void> {
  const post = (path: string, body: unknown) =>
    fetch(`${harness.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: who.cookie },
      body: JSON.stringify(body),
    })

  const madeGroup = await post('/api/groups', { name: `deleting-${String(Date.now())}` })
  if (!madeGroup.ok) throw new Error(`could not make a group: ${String(madeGroup.status)}`)
  const { id: groupId } = (await madeGroup.json()) as { id: string }

  const { customers } = await import('../src/db/schema/index.js')
  const { eq } = await import('drizzle-orm')
  const [fallback] = await harness.app
    .get<Database>(DATABASE)
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.isDefault, true))
  if (!fallback) throw new Error('the install holds no default customer')

  const held = await post(`/api/groups/${groupId}/customers`, { customerId: fallback.id })
  if (!held.ok) throw new Error(`could not hold the customer: ${String(held.status)}`)

  const joined = await post(`/api/groups/${groupId}/members`, { userId: who.id, level: 'delete' })
  if (!joined.ok) throw new Error(`could not join the group: ${String(joined.status)}`)
}

export interface Operation {
  method: string
  /** The templated path, for example `/api/cases/{id}` - what the document calls it. */
  template: string
  /** The same path with parameters filled, ready to request. */
  path: string
  operationId?: string
}

/** A syntactically valid id that no fixture creates, so a sweep never matches a row. */
const NOWHERE = '00000000-0000-4000-8000-000000000000'

const STAND_INS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\{collection\}/g, 'systems'],
  [/\{slug\}/g, 'report-snippets'],
  [/\{name\}/g, 'nothing-by-this-name'],
  [/\{username\}/g, 'nobody'],
  [/\{userId\}/g, NOWHERE],
  [/\{[^}]+\}/g, NOWHERE],
]

/**
 * Every operation the reference publishes, with its path parameters filled in
 * from `STAND_INS` so a sweep never matches a real row.
 */
export function operations(document: OpenAPIObject): Operation[] {
  const found: Operation[] = []
  for (const [template, item] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(item as Record<string, unknown>)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
      let path = template
      for (const [pattern, value] of STAND_INS) path = path.replace(pattern, value)
      found.push({
        method: method.toUpperCase(),
        template,
        path,
        operationId: (operation as { operationId?: string }).operationId,
      })
    }
  }
  return found
}

/**
 * Seed the demo cases and their reports into a booted harness.
 */
export async function seedDemoContent(harness: Harness): Promise<void> {
  const { DemoSeederService } = await import('../src/demos/seeder.service.js')
  const { DemoReportSender } = await import('../src/demo-reports/sender.service.js')
  await harness.app.get(DemoSeederService, { strict: false }).reseed()
  await harness.app.get(DemoReportSender, { strict: false }).fileDeclared()
}
