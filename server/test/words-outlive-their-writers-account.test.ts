/**
 * Prose whose latest writer's account is deleted before the save is stored, attributed to the writers who remain.
 */
import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq } from 'drizzle-orm'
import * as Y from 'yjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { as } from './acting.js'
import { openTestPool } from './database.js'
import { user } from '../src/db/schema/auth.js'
import { cases } from '../src/db/schema/case.js'
import { changeFeed } from '../src/db/schema/change-feed.js'
import { caseNotes } from '../src/db/schema/tracker.js'
import { NOTE_FRAGMENT, ProseService, type ProseRecord } from '../src/prose/prose.service.js'
import { fragmentFor } from '../src/domain/prose-fields.js'

const STAMP = String(Date.now())

describe.skipIf(!(await bootable()))('prose whose writer is gone', () => {
  let harness: Harness
  let analyst: Persona
  const pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
  const seed = drizzle({ client: pool })
  let caseId = ''

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${harness.base}${path}`, {
      method: 'POST',
      headers: { cookie: analyst.cookie, 'content-type': 'application/json', origin: harness.origin },
      body: JSON.stringify(body),
    })
    expect(response.status, `POST ${path}`).toBeLessThan(300)
    return (await response.json()) as T
  }

  /** Types `words` into the note's document as `who`, the way a socket frame arrives. */
  async function type(prose: ProseService, address: ProseRecord, who: Persona | { id: string }, words: string) {
    const held = await prose.open(caseId, address)
    const local = new Y.Doc()
    Y.applyUpdate(local, Y.encodeStateAsUpdate(held))
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(words)])
    fragmentFor(local, NOTE_FRAGMENT).insert(0, [paragraph])
    const frame = prose.frameUpdate(Y.encodeStateAsUpdate(local, Y.encodeStateVector(held)))
    await prose.apply(caseId, address, frame, Symbol('socket'), { id: who.id, label: 'Writer', headers: {} })
  }

  beforeAll(async () => {
    harness = await boot()
    analyst = await sharedAnalyst(harness)
    caseId = (await post<{ id: string }>('/api/cases', { title: `Gone writer ${STAMP}` })).id
  }, 120_000)

  afterAll(async () => {
    if (caseId) await seed.delete(cases).where(eq(cases.id, caseId))
    await pool.end()
    await harness?.close()
  })

  it('stores what was typed and names only the writers whose accounts remain', async () => {
    const note = await post<{ id: string }>(`/api/cases/${caseId}/casenotes`, { note: 'first words' })
    const address: ProseRecord = { table: 'casenotes', id: note.id }
    const gone = { id: randomUUID() }
    const now = new Date()
    await seed.insert(user).values({
      id: gone.id,
      name: 'Gone Writer',
      email: `${gone.id}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    const prose = as(analyst.id, harness.app.get(ProseService, { strict: false }))

    await type(prose, address, analyst, `the analyst's words ${STAMP}`)
    await type(prose, address, gone, `words from an account about to go ${STAMP}`)
    await seed.delete(user).where(eq(user.id, gone.id))
    await prose.flush(caseId, address)

    const [row] = await seed
      .select({ document: caseNotes.document, updatedBy: caseNotes.updatedBy })
      .from(caseNotes)
      .where(eq(caseNotes.id, note.id))
    const stored = Buffer.from(row!.document ?? []).toString('utf8')
    expect(stored).toContain(`words from an account about to go ${STAMP}`)
    expect(row!.updatedBy).toBe(analyst.id)
    const feed = await seed
      .select({ actorId: changeFeed.actorId })
      .from(changeFeed)
      .where(and(eq(changeFeed.entity, 'casenotes'), eq(changeFeed.entityId, note.id)))
    expect(feed.map((one) => one.actorId)).not.toContain(gone.id)
    expect(feed.map((one) => one.actorId)).toContain(analyst.id)
    await prose.release(caseId, address)
  })
})
