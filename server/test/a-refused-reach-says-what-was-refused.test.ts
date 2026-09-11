/**
 * A refused reach is logged as a refusal, and says which case was refused.
 *
 * *THEN the refusal is logged with who was refused and what they asked for.*
 *
 * **Driven through a booted app, because the defect is one no unit test can
 * see.** Guards run before pre-controller interceptors, so a guard's throw
 * reaches the exceptions layer without passing through `AuditInterceptor` at
 * all -- and `audit.interceptor.test.ts` drives the interceptor directly, by
 * design, so its refusal branch passes while no guard refusal reaches it.
 *
 * **Three refusals, and only two of them are refused reach.** A case that does
 * not exist is not a reach that was refused; there was nothing to reach. It
 * stays an ordinary failed call, and the third test here is what holds that --
 * without it the audit fills with every mistyped id and the run of denials an
 * investigation looks for is buried in them.
 *
 * That split is also what makes the case id safe to record. An id only reaches
 * the log once a row has been found for it, so it is one the application
 * generated rather than caller-chosen text -- which is the objection `routeOf`
 * exists to answer, kept whole.
 *
 * What this does not assert is the sign-in half of the same requirement, which
 * `a-sign-in-leaves-a-line.test.ts` owns.
 */
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { cases } from '../src/db/schema/case.js'
import { customers } from '../src/db/schema/customer.js'
import { installActivity } from '../src/db/schema/install-activity.js'
import { openTestPool } from './database.js'

const PASSWORD = 'a-password-long-enough-to-pass'
const CHOSEN = 'the-password-they-chose-themselves'
const ANALYST = `refused-reach-${String(Date.now())}@example.test`

/**
 * A well-formed id that names no case at all.
 *
 * Fresh per run rather than a constant: the audit is append-only, so a line
 * written against a fixed id by a regression outlives the regression and fails
 * every run after it.
 */
const ABSENT = randomUUID()

let harness: Harness | null = null
let admin: Persona
let analyst: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let theirs = ''
let ours = ''
let customerId = ''

interface Line {
  event: string
  actorId: string | null
  detail: Record<string, string>
}

/** Every line recorded against this case, whatever its event. */
async function linesFor(caseId: string): Promise<Line[]> {
  const db = drizzle({ client: pool! })
  return db
    .select({
      event: installActivity.event,
      actorId: installActivity.actorId,
      detail: installActivity.detail,
    })
    .from(installActivity)
    .where(sql`${installActivity.detail}->>'case' = ${caseId}`)
}

/** The `access_denied` lines naming this case. */
async function deniedLines(caseId: string): Promise<Line[]> {
  const found = await linesFor(caseId)
  return found.filter((one) => one.event === 'access_denied')
}

/**
 * How many `access_denied` lines name this case.
 *
 * A count rather than a boolean because two is a failure as surely as none:
 * one refusal recorded twice is the shape a second writer produces, and it is
 * what says whether a guard's throw reaches the interceptor after all.
 */
async function deniedFor(caseId: string): Promise<number> {
  return (await deniedLines(caseId)).length
}

describe.skipIf(!(await bootable()))('a reach that was refused', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: ANALYST,
        displayName: 'Refused Reach Analyst',
        password: PASSWORD,
        role: 'analyst',
      }),
    })
    expect(made.status, `creating the account answered ${await made.text()}`).toBe(201)

    analyst = await signIn(harness, ANALYST, PASSWORD)
    const lifted = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ current: PASSWORD, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(lifted.status, 'the password hold was not lifted, so every route refuses').toBe(200)
    analyst = await signIn(harness, ANALYST, CHOSEN)

    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    const db = drizzle({ client: pool })

    const [customer] = await db
      .insert(customers)
      .values({ name: `Refused ${String(Date.now())}` })
      .returning({ id: customers.id })
    customerId = customer!.id
    const [fallback] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.isDefault, true))
      .limit(1)

    const [one] = await db
      .insert(cases)
      .values({ title: 'On a customer they do not reach', customerId })
      .returning({ id: cases.id })
    theirs = one!.id
    const [two] = await db
      .insert(cases)
      .values({ title: 'On the default customer', customerId: fallback!.id })
      .returning({ id: cases.id })
    ours = two!.id
  }, 90_000)

  afterAll(async () => {
    // The activity lines are left where they are. An audit is append-only by
    // design -- `record.test.ts` holds that neither role may delete from it --
    // and the ids these name are unique to this run, so nothing reads them again.
    const db = drizzle({ client: pool! })
    await db.delete(cases).where(eq(cases.id, theirs))
    await db.delete(cases).where(eq(cases.id, ours))
    await db.delete(customers).where(eq(customers.id, customerId))
    await pool?.end()
    await harness?.close()
  })

  it('records a reach it refused for weakness, and still answers 403', async () => {
    // Deleting needs `delete`; an analyst holds `write` on the default
    // customer, so this refuses with the case in hand and reach to spare.
    const answer = await fetch(`${harness!.base}/api/cases/${ours}`, {
      method: 'DELETE',
      headers: { cookie: analyst.cookie },
    })

    expect(answer.status, 'the caller is owed the same refusal as before').toBe(403)
    expect(
      await deniedFor(ours),
      'a reach refused for weakness owes exactly one `access_denied` line naming the case',
    ).toBe(1)
  })

  it('records a reach it refused for absence, and still answers 404', async () => {
    const answer = await fetch(`${harness!.base}/api/cases/${theirs}`, {
      headers: { cookie: analyst.cookie },
    })

    expect(answer.status, 'the caller is owed a 404, so they cannot learn the case exists').toBe(
      404,
    )

    const [line] = await deniedLines(theirs)
    expect(
      line,
      'a reach refused for having none owes exactly one `access_denied` line naming the case',
    ).toBeDefined()
    expect(await deniedFor(theirs), 'the refusal was recorded more than once').toBe(1)

    // Both halves of the THEN, which is what the scenario asks for: who was
    // refused, and what they asked for.
    expect(line!.actorId, 'the line does not say who was refused').toBe(analyst.id)
    expect(line!.detail['case'], 'the line does not say which case').toBe(theirs)
    expect(line!.detail['customer'], 'the line does not say whose customer').toBe(customerId)
  })

  it('does not call a case that is simply not there a refused reach', async () => {
    const answer = await fetch(`${harness!.base}/api/cases/${ABSENT}`, {
      headers: { cookie: analyst.cookie },
    })

    expect(answer.status, 'an absent case answers 404').toBe(404)
    expect(
      await deniedFor(ABSENT),
      'a case that does not exist was logged as a refused reach, which buries the run of ' +
        'denials an investigation looks for under every mistyped id',
    ).toBe(0)
  })
})
