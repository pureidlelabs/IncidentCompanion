import { randomUUID } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'
import { WebSocket } from 'ws'

import { DATABASE } from '../src/db/db.module.js'
import type { Database } from '../src/db/client.js'
import { installActivity, session } from '../src/db/schema/index.js'
import { sharedAdmin, signIn, type Harness } from './app-harness.js'

/**
 * The address each reader recorded for requests presenting `forged` as the
 * caller: a failed sign-in's audit line, a refused socket's audit line, and a
 * successful sign-in's session row.
 */
export async function attributedWhenPresenting(
  harness: Harness,
  forged: Record<string, string>,
): Promise<{ signInFailed: string | null; socketRefused: string | null; session: string | null }> {
  const db = harness.app.get<Database>(DATABASE)

  const account = `nobody-${randomUUID()}@example.invalid`
  await fetch(`${harness.base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { ...forged, 'content-type': 'application/json' },
    body: JSON.stringify({ email: account, password: 'not-the-password-at-all' }),
  })

  const asked = randomUUID()
  const socket = new WebSocket(`${harness.base.replace('http://', 'ws://')}/api/cases/${asked}/live`, {
    headers: { ...forged, origin: 'https://elsewhere.invalid' },
  })
  await new Promise<void>((settled) => {
    socket.on('unexpected-response', () => {
      settled()
    })
    socket.on('error', () => {
      settled()
    })
  })
  socket.terminate()

  const admin = await sharedAdmin(harness)
  await signIn(harness, admin.email, undefined, forged)

  const lineFor = async (event: 'sign_in_failed' | 'live_refused', key: string, value: string) => {
    for (let tries = 0; tries < 50; tries += 1) {
      const [row] = await db
        .select({ ipAddress: installActivity.ipAddress })
        .from(installActivity)
        .where(and(eq(installActivity.event, event), sql`${installActivity.detail} ->> ${key} = ${value}`))
      if (row) return row.ipAddress
      await new Promise((wake) => setTimeout(wake, 20))
    }
    throw new Error(`no ${event} line was written for ${value}`)
  }
  const [newest] = await db
    .select({ ipAddress: session.ipAddress })
    .from(session)
    .where(eq(session.userId, admin.id))
    .orderBy(desc(session.createdAt))
    .limit(1)

  return {
    signInFailed: await lineFor('sign_in_failed', 'account', account),
    socketRefused: await lineFor('live_refused', 'case', asked),
    session: newest?.ipAddress ?? null,
  }
}
