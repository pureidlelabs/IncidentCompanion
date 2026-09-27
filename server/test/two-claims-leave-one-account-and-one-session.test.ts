/**
 * Two claims arriving together on an install with no accounts leave one
 * account, and only the winner holds a session anywhere.
 *
 * Driven over HTTP on an install of its own. The token is read from the
 * controller, standing in for reading the console it is printed to. A round
 * whose loser was refused before signing up proves nothing about the loser, so
 * the run must include at least one round the loser lost after it.
 */
import { Redis } from 'ioredis'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SetupController } from '../src/auth/setup.controller.js'
import { bootable, unclaimedInstall, type Harness } from './app-harness.js'

const PASSWORD = 'claim-race-password-1234'
const ROUNDS = 12

let harness: (Harness & { owner: string }) | null = null
let owner: Pool
let redis: Redis

const claim = (token: string, username: string) =>
  fetch(`${harness!.base}/api/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: harness!.base },
    body: JSON.stringify({ token, username, password: PASSWORD, repeat: PASSWORD }),
  })

/** Whose session a Redis key holds, for the keys the session store writes. */
function holderOf(key: string, value: string | null): string | undefined {
  const listed = /active-sessions-(.+)$/.exec(key)
  if (listed) return listed[1]
  try {
    const parsed = JSON.parse(value ?? '') as { session?: { userId?: string } }
    return parsed.session?.userId
  } catch {
    return undefined
  }
}

describe.skipIf(!(await bootable()))('two claims arriving together', () => {
  beforeAll(async () => {
    harness = await unclaimedInstall()
    if (!harness) return
    owner = new Pool({ connectionString: harness.owner })
    redis = new Redis(process.env['REDIS_URL']!)
  }, 120_000)

  afterAll(async () => {
    await redis?.quit()
    await owner?.end()
    await harness?.close()
  })

  it('leave one account, and a session for the winner alone', async (context) => {
    if (!harness) return context.skip()
    const setup = harness.app.get(SetupController)
    let tookBack = 0

    for (let round = 0; round < ROUNDS; round += 1) {
      // The throttler's burst tier allows 25 a second.
      await new Promise((resolve) => setTimeout(resolve, 1100))
      await owner.query('truncate "user", install_claim cascade')
      await setup.mintIfUnclaimed()
      const token = (setup as unknown as { token: string | null }).token!
      const keysBefore = new Set(await redis.keys('auth:*'))

      const answers = await Promise.all([
        claim(token, `claim-a-${String(round)}@harness.test`),
        claim(token, `claim-b-${String(round)}@harness.test`),
      ])
      const bodies = await Promise.all(answers.map((one) => one.text()))
      const won = answers.findIndex((one) => one.status === 200)
      const lost = 1 - won
      expect(won, `round ${String(round)}: ${bodies.join(' | ')}`).toBeGreaterThanOrEqual(0)
      expect(answers[lost]!.status, `round ${String(round)}: ${bodies.join(' | ')}`).toBe(403)
      if (bodies[lost]!.includes('already has an administrator')) tookBack += 1

      expect(answers[won]!.headers.get('set-cookie'), 'the winner was not signed in').toBeTruthy()
      expect(
        answers[lost]!.headers.get('set-cookie'),
        'the losing claim carries a session',
      ).toBeNull()

      const users = (await owner.query<{ id: string; role: string }>('select id, role from "user"'))
        .rows
      expect(users, 'more than one account survived the race').toHaveLength(1)
      expect(users[0]!.role, 'the winner is not the administrator').toBe('admin')
      const winner = users[0]!.id
      const served = await fetch(`${harness.base}/api/accounts`, {
        headers: { cookie: answers[won]!.headers.get('set-cookie')!.split(';')[0]! },
      })
      expect(served.status, "the winner's session does not administer the install").toBe(200)

      const sessions = (
        await owner.query<{ userId: string }>('select user_id as "userId" from session')
      ).rows
      expect(
        sessions.every((one) => one.userId === winner),
        'a session names another account',
      ).toBe(true)

      for (const key of (await redis.keys('auth:*')).filter((one) => !keysBefore.has(one))) {
        const holder = holderOf(key, key.includes('active-sessions-') ? null : await redis.get(key))
        if (holder !== undefined)
          expect(holder, `${key} holds another account's session`).toBe(winner)
      }
    }

    expect(tookBack, 'no round reached the losing claim after it signed up').toBeGreaterThan(0)
  }, 120_000)
})
