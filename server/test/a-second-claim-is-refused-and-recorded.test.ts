/**
 * Claiming an install that is already claimed is refused, and leaves a line.
 *
 * *THEN it is refused, AND the attempt is recorded.* `claiming-an-install.test.ts`
 * holds the refusal -- it is the state the shared database is permanently in --
 * and stops there. The recording is the half nothing asserted, and it is the
 * half that matters: an install nobody can claim twice still wants to know that
 * somebody tried.
 *
 * **Nothing in `setup.controller.ts` records anything.** The line comes from
 * `AuditInterceptor`, whose `refused` branch writes `access_denied` for any
 * `ForbiddenException` -- and unlike its other branch that one does not consult
 * `interesting`, so it covers this route without the route knowing. That is
 * worth a test precisely because it is incidental: nothing in the setup path
 * would break if it stopped happening.
 *
 * **The write is fire-and-forget**, so the line is waited for rather than read
 * once -- `audit.interceptor.test.ts` records the same about its own.
 */
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'
import { installActivity } from '../src/db/schema/install-activity.js'
import { openTestPool } from './database.js'

let harness: Harness | null = null
let pool: ReturnType<typeof openTestPool> | null = null

/** `access_denied` lines against the setup route, newest included. */
async function refusals(): Promise<{ id: string }[]> {
  const db = drizzle({ client: pool! })
  return db
    .select({ id: installActivity.id })
    .from(installActivity)
    .where(
      and(
        eq(installActivity.event, 'access_denied'),
        eq(installActivity.targetLabel, 'POST /api/setup'),
      ),
    )
}

describe.skipIf(!(await bootable()))('a claim on an install that already has accounts', () => {
  beforeAll(async () => {
    harness = await boot()
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
  }, 90_000)

  afterAll(async () => {
    await pool?.end()
    await harness?.close()
  })

  it('is refused, and the refusal is written down', async () => {
    const before = new Set((await refusals()).map((one) => one.id))

    const answer = await fetch(`${harness!.base}/api/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'not-this-installs-setup-token',
        username: 'a-second-administrator@example.test',
        displayName: 'A Second Administrator',
        password: 'a-password-long-enough-to-pass',
        repeat: 'a-password-long-enough-to-pass',
      }),
    })

    expect(answer.status, 'a claim on a claimed install was not refused').toBe(403)

    /**
     * Waited for rather than read once. Ten tries at 50ms is two orders of
     * magnitude more than the write needs and still fails in under a second if
     * the line never comes.
     */
    let added: string[] = []
    for (let tries = 0; tries < 10 && added.length === 0; tries += 1) {
      await new Promise((wake) => setTimeout(wake, 50))
      added = (await refusals()).map((one) => one.id).filter((id) => !before.has(id))
    }

    expect(
      added,
      'the refusal left no line, so an install cannot be asked who tried to claim it',
    ).toHaveLength(1)
  })
})
