/**
 * Changing an install setting is refused to an analyst and recorded for an
 * administrator.
 *
 * *Changing an install setting MUST be an administrative act, MUST be refused
 * to anybody who is not an administrator, and MUST be recorded as an
 * administrative event.*
 *
 * **The administrator's change is the control for the analyst's refusal.** A
 * route that refused everybody, or a body the pipe rejected, would refuse the
 * analyst too -- and the accepted change on the same key with the same value is
 * what says the refusal was the role.
 *
 * **`audit.runWindowMinutes` is chosen for what it does not touch.** Every key
 * in `POLICY_SETTINGS` would serve, and the auth ones feed the lockout and
 * session behaviour other files in this run depend on. The value is read first
 * and put back afterwards, because files share one database within a run.
 *
 * The refusal is `@AdminOnly()` on the controller class, so a route added to it
 * tomorrow inherits this rather than being the one somebody forgot.
 *
 * **Nothing here asserts the refusal was recorded, and that is a finding rather
 * than an omission.** `AuditInterceptor` writes `access_denied` from
 * `catchError`, which never runs for an exception a *guard* threw -- guards run
 * before interceptors. Measured: an analyst refused here, an anonymous caller
 * refused by the auth guard, and a `CaseAccessGuard` 403 all leave the audit
 * empty, while a `ForbiddenException` thrown inside a handler files a line.
 * -> #202
 */
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { installActivity } from '../src/db/schema/install-activity.js'
import { openTestPool } from './database.js'

const KEY = 'audit.runWindowMinutes'

const PASSWORD = 'a-password-long-enough-to-pass'
const CHOSEN = 'the-password-they-chose-themselves'
const ANALYST = `policy-analyst-${String(Date.now())}@example.test`

let harness: Harness | null = null
let admin: Persona
let analyst: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let held = 0

const put = (cookie: string, value: number) =>
  fetch(`${harness!.base}/api/install/policy`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ key: KEY, value }),
  })

/**
 * The lines a change files, which are the route's own rather than the
 * interceptor's.
 *
 * **`settingChanged` names the act, so the interceptor stays quiet.** It marks
 * the request and the interceptor skips a request already named -- that is what
 * stops one act being recorded twice, vaguely and precisely. So the line to
 * look for carries the *setting's key* as its target, never the route.
 */
async function changeLines(): Promise<{ id: string }[]> {
  return drizzle({ client: pool! })
    .select({ id: installActivity.id })
    .from(installActivity)
    .where(and(eq(installActivity.event, 'setting_changed'), eq(installActivity.targetLabel, KEY)))
}

describe.skipIf(!(await bootable()))('changing what the install decides', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')

    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: ANALYST,
        displayName: 'Policy Analyst',
        password: PASSWORD,
        role: 'analyst',
      }),
    })
    const body = await made.text()
    expect(made.status, `creating the account answered ${body}`).toBe(201)

    analyst = await signIn(harness, ANALYST, PASSWORD)
    const lifted = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ current: PASSWORD, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(lifted.status, 'the password hold was not lifted, so every route refuses').toBe(200)
    analyst = await signIn(harness, ANALYST, CHOSEN)

    const view = await fetch(`${harness.base}/api/install/policy`, {
      headers: { cookie: admin.cookie },
    })
    const settings = ((await view.json()) as {
      settings: Record<string, { value: number; floor: number; ceiling: number }>
    }).settings
    held = settings[KEY]!.value
    expect(held, 'no value was read for the setting, so none can be put back').toBeGreaterThan(0)
  }, 90_000)

  afterAll(async () => {
    if (harness && held > 0) await put(admin.cookie, held)
    await pool?.end()
    await harness?.close()
  })

  it('refuses an analyst who is not an administrator', async () => {
    const answer = await put(analyst.cookie, held + 1)
    expect(
      answer.status,
      'an analyst changed what the install decides, so the setting is not administrative',
    ).toBe(403)
  })

  it('takes the same change from an administrator, and files a line for it', async () => {
    const before = new Set((await changeLines()).map((one) => one.id))

    const answer = await put(admin.cookie, held + 1)
    expect(
      answer.status,
      `an administrator could not make the change either, so the refusal above was not the role: ${await answer.text()}`,
    ).toBe(200)

    // Fire-and-forget, so waited for rather than read once.
    let added: string[] = []
    for (let tries = 0; tries < 10 && added.length === 0; tries += 1) {
      await new Promise((wake) => setTimeout(wake, 50))
      added = (await changeLines()).map((one) => one.id).filter((id) => !before.has(id))
    }

    expect(
      added,
      'the change left no line, so an install cannot be asked who altered what it decides',
    ).toHaveLength(1)
  })

})
