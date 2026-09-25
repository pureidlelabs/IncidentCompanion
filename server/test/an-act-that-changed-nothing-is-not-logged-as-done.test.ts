/**
 * An administrative request that changed nothing is not logged as the change
 * it named: revoking or releasing what is not there is refused as not there,
 * and asking for a state already held writes no second line.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'

const STAMP = String(Date.now())
const NO_GROUP = '00000000-0000-4000-8000-000000000000'

describe.skipIf(!(await bootable()))('an administrative act that changed nothing', () => {
  let harness: Harness
  let admin: Persona
  let analyst: Persona
  let pool: ReturnType<typeof openTestPool>
  let customerId = ''

  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: admin.cookie, 'content-type': 'application/json', origin: harness.origin },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, text: await response.text() }
  }

  const aGroup = async () => {
    const made = await call('POST', '/api/groups', { name: `nothing-changed-${STAMP}` })
    expect(made.status, made.text).toBe(201)
    return (JSON.parse(made.text) as { id: string }).id
  }

  /** The named lines about a group, oldest first. */
  const linesAbout = async (groupId: string) =>
    (
      await pool.query<{ event: string }>(
        "select event from install_activity where detail->>'groupId' = $1 and event <> 'group_created' order by seq",
        [groupId],
      )
    ).rows.map((row) => row.event)

  const linesNaming = async (target: string, events: string[]) =>
    (
      await pool.query<{ event: string }>(
        'select event from install_activity where target_label = $1 and event = any($2::install_event[]) order by seq',
        [target, events],
      )
    ).rows.map((row) => row.event)

  const lastSeq = async () =>
    (await pool.query<{ seq: string }>('select coalesce(max(seq), 0)::text as seq from install_activity')).rows[0]!.seq

  /** The boundary's own success lines this administrator left on these routes after `seq`. */
  const successesSince = async (seq: string, routes: string[]) =>
    (
      await pool.query<{ target_label: string }>(
        "select target_label from install_activity where seq > $1::bigint and event = 'api_called' and status_id = 1 and actor_id = $2 and target_label = any($3::text[]) order by seq",
        [seq, admin.id, routes],
      )
    ).rows.map((row) => row.target_label)

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    analyst = await sharedAnalyst(harness)
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    const made = await call('POST', '/api/customers', { name: `Nothing changed ${STAMP}` })
    expect(made.status, made.text).toBe(201)
    customerId = (JSON.parse(made.text) as { id: string }).id
  }, 120_000)

  afterAll(async () => {
    await pool?.end()
    await harness?.close()
  })

  it('refuses a revocation of nobody in the group as not there, and logs no revocation', async () => {
    const group = await aGroup()

    const never = await call('DELETE', `/api/groups/${group}/members/${analyst.id}`)
    const nobody = await call('DELETE', `/api/groups/${group}/members/nobody-at-all`)
    const noGroup = await call('DELETE', `/api/groups/${NO_GROUP}/members/${analyst.id}`)

    expect([never.status, nobody.status, noGroup.status]).toEqual([404, 404, 404])
    expect(await linesAbout(group)).toEqual([])
    expect(await linesAbout(NO_GROUP)).toEqual([])
  })

  it('refuses a release of a customer the group does not hold as not there, and logs no release', async () => {
    const group = await aGroup()

    const never = await call('DELETE', `/api/groups/${group}/customers/${customerId}`)
    const noGroup = await call('DELETE', `/api/groups/${NO_GROUP}/customers/${customerId}`)

    expect([never.status, noGroup.status]).toEqual([404, 404])
    expect(await linesAbout(group)).toEqual([])
    expect(await linesAbout(NO_GROUP)).toEqual([])
  })

  it('logs a hold and a grant once however often and however concurrently asked, and a revocation and a release that happened', async () => {
    const group = await aGroup()
    const since = await lastSeq()
    const thrice = (path: string, body: unknown) =>
      Promise.all([0, 1, 2].map(async () => (await call('POST', path, body)).status))

    expect(await thrice(`/api/groups/${group}/customers`, { customerId })).toEqual([200, 200, 200])
    expect(await thrice(`/api/groups/${group}/members`, { userId: analyst.id, level: 'read' })).toEqual([200, 200, 200])
    expect(await thrice(`/api/groups/${group}/members`, { userId: analyst.id, level: 'write' })).toEqual([200, 200, 200])
    expect((await call('DELETE', `/api/groups/${group}/members/${analyst.id}`)).status).toBe(200)
    expect((await call('DELETE', `/api/groups/${group}/customers/${customerId}`)).status).toBe(200)

    expect(await linesAbout(group)).toEqual([
      'group_held_customer',
      'reach_granted',
      'reach_granted',
      'reach_revoked',
      'group_released_customer',
    ])
    expect(await successesSince(since, ['POST /api/groups/:groupId/customers', 'POST /api/groups/:groupId/members'])).toEqual([])
  })

  it('logs no account state or role the account already had, however concurrently asked', async () => {
    const username = `nothing-changed-${STAMP}@example.test`
    const made = await call('POST', '/api/accounts', {
      username,
      displayName: 'Nothing changed',
      password: 'a-password-long-enough-to-pass',
      role: 'analyst',
    })
    expect(made.status, made.text).toBe(201)
    const at = `/api/accounts/${encodeURIComponent(username)}`
    const since = await lastSeq()
    const four = (verb: string) => Promise.all([0, 1, 2, 3].map(async () => (await call('POST', `${at}/${verb}`)).status))

    expect((await call('POST', `${at}/enable`)).status).toBe(200)
    expect((await call('POST', `${at}/role`, { role: 'analyst' })).status).toBe(200)
    expect(await four('disable')).toEqual([200, 200, 200, 200])
    expect(await four('enable')).toEqual([200, 200, 200, 200])

    expect(await linesNaming(username, ['account_enabled', 'account_disabled', 'account_role_changed'])).toEqual([
      'account_disabled',
      'account_enabled',
    ])
    expect(
      await successesSince(since, [
        'POST /api/accounts/:username/enable',
        'POST /api/accounts/:username/disable',
        'POST /api/accounts/:username/role',
      ]),
    ).toEqual([])
  })
})
