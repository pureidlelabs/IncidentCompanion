/**
 * Refusing a case out of reach costs what refusing one that does not exist
 * costs, at both doors.
 *
 * > A refusal MUST NOT disclose the existence of something the caller may not
 * > reach. Not there and not yours MUST be indistinguishable.
 *
 * **The clock is the attack and the statements are the evidence.** Timing a
 * refusal is noisy by nature, so this asks what the timing is made of: every
 * statement the server sends the store before it writes the answer's head, for
 * an id naming nothing and for a case moved out of the caller's reach. A
 * difference in that list is a difference an attacker averages out; the same
 * list is the mechanism that makes the two answers take the same work.
 *
 * **The refusal is still recorded**, once the answer has gone, which is the
 * half that must not be bought back by making the two the same.
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'

import { and, eq, gt } from 'drizzle-orm'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  boot,
  bootable,
  sharedAdmin,
  sharedAnalyst,
  type Harness,
  type Persona,
} from './app-harness.js'
import { DATABASE } from '../src/db/db.module.js'
import type { Database } from '../src/db/client.js'
import { installActivity } from '../src/db/schema/install-activity.js'
import { LiveGateway } from '../src/live/live.gateway.js'

type Mark = { kind: 'sql'; text: string } | { kind: 'head' }

let heard: Mark[] | null = null
type Method = (this: unknown, ...args: unknown[]) => unknown
const originalQuery = Reflect.get(pg.Client.prototype, 'query') as Method
const originalWriteHead = Reflect.get(http.ServerResponse.prototype, 'writeHead') as Method

let harness: Harness
let admin: Persona
let analyst: Persona
let movedAway = ''
let movedTo = ''

const said = (marks: Mark[]): string[] =>
  marks
    .filter((one): one is { kind: 'sql'; text: string } => one.kind === 'sql')
    .map((one) => one.text.replace(/\$\d+/g, '?').replace(/\s+/g, ' '))

/** The statements a request made before its head was written. */
async function workBefore(path: string): Promise<string[]> {
  heard = []
  const response = await fetch(`${harness.base}${path}`, { headers: { cookie: analyst.cookie } })
  await response.text()
  const marks = heard
  heard = null
  const head = marks.findIndex((one) => one.kind === 'head')
  expect(head, 'no head was written, so nothing was measured').toBeGreaterThanOrEqual(0)
  return said(marks.slice(0, head))
}

/** The statements the socket's admission made for a case id. */
async function socketWork(caseId: string): Promise<{ verdict: unknown; statements: string[] }> {
  const gateway = harness.app.get(LiveGateway)
  heard = []
  const verdict = await gateway.check({
    url: `/api/cases/${caseId}/live`,
    headers: { cookie: analyst.cookie, origin: harness.base, host: new URL(harness.base).host },
  } as unknown as http.IncomingMessage)
  const marks = heard
  heard = null
  return { verdict, statements: said(marks) }
}

describe.skipIf(!(await bootable()))('a refusal, whether or not the case exists', () => {
  beforeAll(async () => {
    Reflect.set(pg.Client.prototype, 'query', function (this: unknown, ...args: unknown[]) {
      const first = args[0]
      const text =
        typeof first === 'string' ? first : (first as { text?: string } | undefined)?.text
      if (heard && text) heard.push({ kind: 'sql', text })
      return originalQuery.apply(this, args)
    })
    Reflect.set(
      http.ServerResponse.prototype,
      'writeHead',
      function (this: unknown, ...args: unknown[]) {
        if (heard) heard.push({ kind: 'head' })
        return originalWriteHead.apply(this, args)
      },
    )

    harness = await boot()
    admin = await sharedAdmin(harness)
    analyst = await sharedAnalyst(harness)
    const call = (path: string, method: string, cookie: string, body: unknown) =>
      fetch(`${harness.base}${path}`, {
        method,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    const customer = await call('/api/customers', 'POST', admin.cookie, {
      name: `Moved away ${String(Date.now())}`,
    })
    const customerId = ((await customer.json()) as { id: string }).id
    movedTo = customerId
    const opened = await call('/api/cases', 'POST', analyst.cookie, { title: 'Moved out of reach' })
    movedAway = ((await opened.json()) as { id: string }).id
    const out = await call(`/api/cases/${movedAway}/customer`, 'PUT', analyst.cookie, {
      customerId,
    })
    expect(out.status, await out.clone().text()).toBe(200)
  }, 120_000)

  afterAll(async () => {
    Reflect.set(pg.Client.prototype, 'query', originalQuery)
    Reflect.set(http.ServerResponse.prototype, 'writeHead', originalWriteHead)
    await harness?.close()
  })

  it('asks the store the same things over a route before answering', async () => {
    const absent = await workBefore(`/api/cases/${randomUUID()}`)
    const outOfReach = await workBefore(`/api/cases/${movedAway}`)

    expect(absent.length, 'the absent case asked nothing, so nothing was compared').toBeGreaterThan(
      0,
    )
    expect(outOfReach, 'a case out of reach was refused after different work').toEqual(absent)
  })

  it('asks the store the same things at the socket before refusing', async () => {
    const absent = await socketWork(randomUUID())
    const outOfReach = await socketWork(movedAway)

    expect(absent.verdict).toEqual({ refused: 'no-such-case' })
    expect(outOfReach.verdict).toEqual({ refused: 'no-such-case' })
    expect(outOfReach.statements).toEqual(absent.statements)
  })

  it('still records the refusal, naming the case and its customer', async () => {
    const since = new Date(Date.now() - 1000)
    const refused = await fetch(`${harness.base}/api/cases/${movedAway}`, {
      headers: { cookie: analyst.cookie },
    })
    expect(refused.status).toBe(404)

    const db = harness.app.get<Database>(DATABASE)
    const lines = async () =>
      db
        .select({ detail: installActivity.detail })
        .from(installActivity)
        .where(
          and(
            eq(installActivity.event, 'access_denied'),
            eq(installActivity.actorId, analyst.id),
            gt(installActivity.at, since),
          ),
        )
    // Written once the answer has gone, so it is waited for rather than assumed.
    let found = await lines()
    for (let tries = 0; found.length === 0 && tries < 50; tries += 1) {
      await new Promise((wake) => setTimeout(wake, 100))
      found = await lines()
    }
    expect(found.map((one) => one.detail)).toContainEqual(
      expect.objectContaining({ case: movedAway, customer: movedTo, held: 'none', needed: 'read' }),
    )
  })
})
