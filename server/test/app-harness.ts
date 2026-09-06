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
 *
 * **So the properties worth asserting here are the ones that quantify over the
 * whole route table** - every route refuses an anonymous caller, every response
 * matches the schema the reference publishes - rather than one test per route.
 * A per-route test is better written against the unit.
 *
 * **It boots the real `AppModule`.** Nothing is stubbed into the graph, because
 * a harness that substitutes the module wiring cannot answer the question this
 * tier exists for: a provider missing from a module fails here, and today fails
 * only when someone starts the server.
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
 *
 * **The dev stack's ports are mapped, not the defaults**, so a harness
 * reaching for 5432/6379 finds nothing and reports the app as unbootable
 * rather than the ports as unmapped.
 *
 * **A literal fallback here is not a safety net, it is another stack.** A
 * hardcoded URL taken when `REDIS_URL` is unset points this worktree's suite
 * at whichever instance the literal names, so it starts its own Redis and
 * writes every key into the main checkout's. Anything already in the
 * environment still wins: an agent handed a URL is pointing somewhere on
 * purpose.
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
 *
 * **Checked rather than attempted.** Booting without Redis throws from inside
 * the module graph, and the stack that comes out names a connection factory
 * rather than the missing service - which reads as a broken harness.
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
  base: string
  document: OpenAPIObject
  close(): Promise<void>
}

/**
 * A collaborator to replace while the app is booted.
 *
 * **This is what makes a failure testable at all.** A real Redis cannot be told
 * to drop the next write, and a real disk cannot be told to fill - so the only
 * way to assert what the app does when they fail is to stand something in that
 * fails on demand. `overrideProvider` is `@nestjs/testing`'s, and it is why a
 * separate mocking library was not needed for this.
 */
export interface Override {
  token: unknown
  value: unknown
}

/**
 * Boots the app on a free port, with the environment filled in first.
 *
 * **`AppModule` is imported dynamically, and that is load-bearing.** It runs
 * `ConfigModule.forRoot` while it loads, which refuses an incomplete
 * environment - a static import throws during collection, which vitest reports
 * as an unhandled rejection *beside* a green run rather than as a failure.
 *
 * The caller closes it.
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
   * application that ships rather than a module graph that resembles it. The
   * bundle and the vendored viewer are left out: no test asserts a static file,
   * and pointing at a `dist` that may not be built would make every boot depend
   * on a frontend build.
   *
   * **Before `init`, and that ordering is the whole point of the call.**
   * `init` mounts Nest's router onto Express; middleware registered after it is
   * appended *behind* the router, so it never runs for a path a controller
   * answers. The symptom is a policy that is present on a 404 and absent on
   * every real response - which reads as the header middleware being broken
   * rather than as being late.
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
   * them.** A harness that skipped them would boot an install that does not
   * exist anywhere -- no case templates, no report layouts, no Dutch.
   *
   * **Demo content is deliberately not here.** It is optional in a real
   * deployment, so a test that reads it says so with `seedDemoContent`.
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
  id: string
}

/**
 * Signs a new account up and returns its session.
 *
 * **A real sign-up through the app's own door, not a session row written by
 * hand.** A fabricated session proves the routes accept whatever the fixture
 * invented; this proves they accept what Better Auth actually issues, which is
 * the thing that will be presented in production.
 *
 * **The first account signed up on a fresh database becomes the admin** - that
 * is the install rule, and it is how this harness gets its two personas: sign
 * up once for an admin, a second time for an analyst.
 */
export async function signUp(
  harness: Harness,
  email: string,
  name = 'Harness',
): Promise<Persona> {
  /**
   * **In process, because `/sign-up/email` is not served.** The setup token is
   * the only way to claim an install over HTTP, and it exists only in the
   * server's console output -- so a fixture would have to scrape a log. This
   * is the call `setup.controller.ts` makes once the token matches, and
   * `disabledPaths` does not intercept an in-process call.
   *
   * The install rule still applies: the first account becomes the
   * administrator, and `sharedAdmin` promotes by hand when a previous run left
   * one behind.
   */
  const auth = harness.app.get<AuthService<Auth>>(AuthService)
  await auth.api.signUpEmail({ body: { email, password: HARNESS_PASSWORD, name } })
  return signIn(harness, email)
}

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
 *
 * **Sign-up closes the moment the install has an account**, so a fixture may
 * not mint an account per test file any more - and the rule has no test-only
 * bypass, on purpose: a harness that could still reach the closed door would be
 * exercising a server nobody runs. What is left is the route an install really
 * has, which is an administrator creating people.
 *
 * **Two is what the suite actually needs.** Measured across every caller: every
 * one wanted "an admin" and nothing asserted on which email it got, and the
 * only file needing two people at once - `analyst-privilege.test.ts` - needs
 * them to differ by *role*, not by identity.
 */
const SHARED = {
  admin: 'harness-admin@example.invalid',
  analyst: 'harness-analyst@example.invalid',
} as const

const ISSUED_PASSWORD = 'harness-issued-1234'

/**
 * The install's administrator, created once and signed into thereafter.
 *
 * **Sign-in first, sign-up only if that fails.** The suite shares one database
 * across the whole run, so by the second file this account already exists -
 * and after the first sign-up the door it came through is shut. Ordering the
 * two the other way makes every file after the first fail on a 403 that says
 * nothing about what it was testing.
 *
 * **Promoted by a direct write when it is not already the admin.** "The first
 * account becomes the admin" is a property of the database, and a database left
 * behind by a previous run may already have one - so being first is not
 * something a fixture can rely on. The alternative, an admin API call, needs
 * the administrator that is being arranged.
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
 * Files boot their own harness against one database, so two can reach an empty
 * install at the same moment; the loser signs in instead of failing the run.
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
 *
 * **Which means it arrives holding a password somebody else chose**, and a held
 * account reaches `/api/change-password` and nothing else. So the fixture walks
 * the whole flow: created, signed in, password replaced, signed in again. A
 * fixture that cleared the hold with a database write would hand every test an
 * analyst in a state no real analyst is ever in.
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
 *
 * **The path the specification names, not a row written past it.** *An
 * administrator can grant themselves data access, and that is deliberate* --
 * and the grant is logged naming them as both grantor and subject, which the
 * requirement calls the product's answer in place of a restriction. A fixture
 * that inserted the membership directly would skip the thing being relied on,
 * and that is how nobody noticed until #116 that no route made a group at all.
 *
 * Needed because the default customer's guarantee is a floor of read and
 * write: nothing reaches `delete` on it without a group.
 *
 * **The default customer's id is read from the database rather than through
 * `GET /api/customers`.** That is a read around the product, not a write past
 * it -- the grant itself goes through the doors, which is the part being
 * relied on.
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
 *
 * **Taken from the document rather than from a hand-kept list**, so a route
 * added tomorrow is swept tomorrow. That is the whole reason these sweeps are
 * worth more than a test per route: the list cannot go stale.
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
 *
 * **Explicit, rather than inherited from boot.** Seeding runs as a one-shot
 * (`src/seed.ts`) so replicas cannot race on a reseed that *deletes* every demo
 * case first, which means no test gets demo data without asking. A test that
 * reads it therefore says so.
 *
 * The order is the seed entry's, for the reason given there: the reports need
 * the cases, and inheriting that from the module graph is what made it fragile.
 */
export async function seedDemoContent(harness: Harness): Promise<void> {
  const { DemoSeederService } = await import('../src/demos/seeder.service.js')
  const { DemoReportSender } = await import('../src/demo-reports/sender.service.js')
  await harness.app.get(DemoSeederService, { strict: false }).reseed()
  await harness.app.get(DemoReportSender, { strict: false }).fileDeclared()
}
