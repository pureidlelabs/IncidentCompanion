/**
 * An install nobody has pointed at a destination keeps the whole record
 * itself, and reports nothing missing for having none.
 *
 * **What this does not cover:** the two scenarios beside it, where a
 * destination is configured and where it cannot be reached. Nothing in this
 * build sends anywhere -- an external collector pages the activity route by
 * `seq` instead -- so both describe a mechanism that does not exist. -> #13
 */
import { and, desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { installActivity } from '../src/db/schema/install-activity.js'
import { openTestPool } from './database.js'

/** The setting the recorded act below changes, chosen because it files a line of its own. */
const KEY = 'audit.runWindowMinutes'

/** How an install would name somewhere to send its record, in the spellings it might use. */
const A_DESTINATION = /destination|syslog|forward|collector|sink|siem|webhook/i

let harness: Harness | null = null
let admin: Persona
let pool: ReturnType<typeof openTestPool> | null = null

const settings = async (): Promise<Record<string, unknown>> =>
  (await (
    await fetch(`${harness!.base}/api/settings`, { headers: { cookie: admin.cookie } })
  ).json()) as Record<string, unknown>

describe.skipIf(!(await bootable()))('an install pointed at no destination', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
  }, 90_000)

  afterAll(async () => {
    await pool?.end()
    await harness?.close()
  })

  it('offers no setting that names one, which is the state under test', async () => {
    const held = await settings()

    expect(Object.keys(held).length, 'the install reported no settings at all').toBeGreaterThan(0)
    expect(
      JSON.stringify(held).match(A_DESTINATION),
      'this install can be pointed at a destination, so it is no longer the install this ' +
        'scenario is about and the cases below are testing something else',
    ).toBeNull()
  })

  it('keeps the line itself when something recorded happens', async () => {
    const db = drizzle({ client: pool! })
    const before = await db
      .select({ seq: installActivity.seq })
      .from(installActivity)
      .orderBy(desc(installActivity.seq))
      .limit(1)

    const answer = await fetch(`${harness!.base}/api/install/policy`, {
      method: 'PUT',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ key: KEY, value: 7 }),
    })
    const said = await answer.text()
    expect(answer.status, `the recorded act was refused: ${said}`).toBeLessThan(300)

    const written = await db
      .select({ seq: installActivity.seq, target: installActivity.targetLabel })
      .from(installActivity)
      .where(
        and(eq(installActivity.event, 'setting_changed'), eq(installActivity.targetLabel, KEY)),
      )
      .orderBy(desc(installActivity.seq))
      .limit(1)

    expect(
      written[0],
      'the install kept no line for an act it records, so with nowhere to send it the record ' +
        'does not exist anywhere',
    ).toBeDefined()
    expect(
      written[0]!.seq > (before[0]?.seq ?? 0n),
      'the newest line predates the act, so the act wrote nothing and an older line is ' +
        'standing in for it',
    ).toBe(true)
  })

  it('serves that line back, so its own copy is reachable as the record', async () => {
    const answer = await fetch(`${harness!.base}/api/install/activity?limit=50`, {
      headers: { cookie: admin.cookie },
    })
    const body = (await answer.json()) as { events?: { event?: string; targetLabel?: string }[] }

    expect(answer.status, 'the install would not serve its own audit').toBe(200)
    expect(
      (body.events ?? []).some(
        (line) => line.event === 'setting_changed' && line.targetLabel === KEY,
      ),
      'the install holds the line and will not hand it over, so its own copy is not a record ' +
        'anybody can read',
    ).toBe(true)
  })

  it('reports nothing incomplete for having none', async () => {
    const answer = await fetch(`${harness!.base}/api/health`)
    const body = await answer.text()

    expect(
      answer.status,
      'the install answers unwell with no destination configured, so an operator is told to ' +
        'fix a configuration that is already complete',
    ).toBe(200)
    expect(
      body.match(A_DESTINATION),
      'health names a destination, so an install configured with nothing reports itself short ' +
        'of something',
    ).toBeNull()
  })
})
