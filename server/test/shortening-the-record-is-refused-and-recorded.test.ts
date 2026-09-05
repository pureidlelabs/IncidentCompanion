/**
 * An administrator cannot shorten the audit below its floor, and the attempt shows.
 *
 * *WHEN they attempt to stop administrative events being logged, THEN it is
 * refused, AND the attempt is logged.*
 *
 * **Retention is the control that reaches the record.** There is no switch that
 * turns the audit off -- `record.test.ts` holds that neither role can delete,
 * edit or truncate a line -- so the way to stop administrative events being
 * kept is to shorten the window they are kept for, and `RETENTION_FLOOR_DAYS`
 * is what stops that.
 *
 * **The refusal is held by `retention.controller.test.ts`**, over four
 * sub-floor values, asserting the sentence and that the stored value did not
 * move. It drives the controller directly, so nothing there can see whether an
 * attempt reaches the audit. That is this file's half.
 *
 * **A 422 is not a `ForbiddenException`**, so the line does not come from the
 * interceptor's refusal branch the way #205's does; it comes from the other
 * one, which writes `api_called` with `status_id: 2` because a `PUT` is a
 * write. Worth naming: the two refusals are recorded by different branches and
 * a change to either leaves the other looking fine.
 */
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { RETENTION_FLOOR_DAYS } from '../src/db/schema/install-activity.js'
import { installActivity } from '../src/db/schema/install-activity.js'
import { openTestPool } from './database.js'

const ROUTE = 'PUT /api/install/audit/retention'

let harness: Harness | null = null
let admin: Persona
let pool: ReturnType<typeof openTestPool> | null = null
/** What the install held before this file touched it. Put back in `afterAll`. */
let held = 0

async function linesFor(): Promise<{ id: string }[]> {
  const db = drizzle({ client: pool! })
  return db
    .select({ id: installActivity.id })
    .from(installActivity)
    .where(and(eq(installActivity.targetLabel, ROUTE), eq(installActivity.statusId, 2)))
}

describe.skipIf(!(await bootable()))('an attempt to shorten the audit below its floor', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')

    const view = await fetch(`${harness.base}/api/install/audit/retention`, {
      headers: { cookie: admin.cookie },
    })
    held = ((await view.json()) as { days: number }).days
    expect(held, 'no retention window was read, so none can be put back').toBeGreaterThan(0)
  }, 90_000)

  /**
   * **Put back, because the second case changes the install.** The window is a
   * setting rather than a fixture, and leaving it at the floor would shorten
   * this database's audit for every file that runs after this one.
   */
  afterAll(async () => {
    if (harness && held > 0) {
      await fetch(`${harness.base}/api/install/audit/retention`, {
        method: 'PUT',
        headers: { cookie: admin.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ days: held }),
      })
    }
    await pool?.end()
    await harness?.close()
  })

  it('is refused, and the attempt is written down', async () => {
    const before = new Set((await linesFor()).map((one) => one.id))

    const answer = await fetch(`${harness!.base}/api/install/audit/retention`, {
      method: 'PUT',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ days: RETENTION_FLOOR_DAYS - 1 }),
    })

    expect(
      answer.status,
      'the audit was shortened below the floor the specification requires',
    ).toBe(422)

    // Fire-and-forget, so waited for rather than read once.
    let added: string[] = []
    for (let tries = 0; tries < 10 && added.length === 0; tries += 1) {
      await new Promise((wake) => setTimeout(wake, 50))
      added = (await linesFor()).map((one) => one.id).filter((id) => !before.has(id))
    }

    expect(
      added,
      'the attempt left no line, so an install cannot be asked who tried to shorten its ' +
        'own record',
    ).toHaveLength(1)
  })

  /**
   * The control: a value the floor permits is accepted, so the refusal above is
   * about the floor rather than about the route being closed or the body being
   * refused by the pipe.
   */
  it('accepts a window at the floor, so the refusal was the floor', async () => {
    const answer = await fetch(`${harness!.base}/api/install/audit/retention`, {
      method: 'PUT',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ days: RETENTION_FLOOR_DAYS }),
    })
    expect(answer.status, `a window at the floor answered ${await answer.text()}`).toBe(200)
  })
})
