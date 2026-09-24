/**
 * A live document is stored by somebody who may still write it, and words the
 * store refuses stay waiting rather than being dropped.
 *
 * > #### Scenario: A writer loses reach before the words are stored
 * > - GIVEN two analysts writing in one note
 * > - WHEN one of them loses write before what both typed is stored
 * > - THEN what they typed is stored by the analyst who still holds write
 *
 * **The attack is a revocation between the keystroke and the flush.** Each
 * edit is applied as the analyst whose frame carried it, the way the socket
 * applies it, and the release runs with nobody named, the way a socket's close
 * does. The store is the real one, on the role the server connects as.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as encoding from 'lib0/encoding'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeSyncStep2 } from 'y-protocols/sync'
import * as Y from 'yjs'

import { NOTE_FRAGMENT, ProseService, type ProseRecord } from './prose.service.js'
import { caseNotes, cases, customers, groupCustomers, groupMembers, groups, user } from '../db/schema/index.js'
import { actingAs } from '../db/scope.js'
import { asRole, hasConcurrentConnections, openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const appPool = URL_ ? openTestPool(URL_, 'ic_app') : null
const seedPool = URL_ ? openTestPool(asRole(URL_, 'ic_seed')) : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

/** One analyst's keystrokes, framed as the socket carries them. */
function typed(text: string): Uint8Array {
  const doc = new Y.Doc({ gc: false })
  doc.getXmlFragment(NOTE_FRAGMENT).insert(0, [new Y.XmlText(text)])
  const encoder = encoding.createEncoder()
  writeSyncStep2(encoder, doc)
  return encoding.toUint8Array(encoder)
}

describe.skipIf(!appPool || !hasConcurrentConnections())(
  'a live document written by an analyst who then loses reach',
  () => {
    const stamp = `${String(process.pid)}-${String(Date.now())}`
    const first = `prose-first-${stamp}`
    const last = `prose-last-${stamp}`
    let customer = ''
    let group = ''
    const made: string[] = []

    const levelOf = (who: string, level: 'read' | 'write') =>
      seed!
        .update(groupMembers)
        .set({ level })
        .where(and(eq(groupMembers.groupId, group), eq(groupMembers.userId, who)))

    async function aNote(): Promise<{ caseId: string; note: ProseRecord }> {
      const caseId = randomUUID()
      made.push(caseId)
      await seed!.insert(cases).values({ id: caseId, title: 'Written by two', customerId: customer })
      const [row] = await seed!
        .insert(caseNotes)
        .values({ caseId, note: 'seed' })
        .returning({ id: caseNotes.id })
      return { caseId, note: { table: 'casenotes', id: row!.id } }
    }

    const stored = async (id: string): Promise<string> => {
      const [row] = await seed!.select({ note: caseNotes.note }).from(caseNotes).where(eq(caseNotes.id, id))
      return row!.note
    }

    beforeAll(async () => {
      await seed!.insert(user).values(
        [first, last].map((id) => ({
          id,
          name: id,
          email: `${id}@example.invalid`,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'analyst',
        })),
      )
      const [held] = await seed!
        .insert(customers)
        .values({ name: `Written by two ${stamp}` })
        .returning({ id: customers.id })
      customer = held!.id
      const [one] = await seed!
        .insert(groups)
        .values({ name: `Both write ${stamp}` })
        .returning({ id: groups.id })
      group = one!.id
      await seed!.insert(groupCustomers).values({ groupId: group, customerId: customer })
      await seed!.insert(groupMembers).values([
        { groupId: group, userId: first, level: 'write' },
        { groupId: group, userId: last, level: 'write' },
      ])
    })

    afterAll(async () => {
      if (made.length > 0) await seed!.delete(cases).where(inArray(cases.id, made))
      await seed!.delete(groups).where(eq(groups.id, group))
      await seed!.delete(customers).where(eq(customers.id, customer))
      await seed!.delete(user).where(inArray(user.id, [first, last]))
      await appPool!.end()
      await seedPool!.end()
    })

    it('is stored by the writer who still holds write when the last one loses it', async () => {
      await levelOf(last, 'write')
      const prose = new ProseService(drizzle({ client: appPool! }))
      const { caseId, note } = await aNote()
      await actingAs(first, () => prose.open(caseId, note))
      await actingAs(last, () => prose.open(caseId, note))

      await actingAs(first, () =>
        prose.apply(caseId, note, typed('typed by the first'), 'first-socket', { id: first, label: first, headers: {} }),
      )
      await actingAs(last, () =>
        prose.apply(caseId, note, typed('typed by the last'), 'last-socket', { id: last, label: last, headers: {} }),
      )
      await levelOf(last, 'read')

      await prose.release(caseId, note)
      await prose.release(caseId, note)

      expect(await stored(note.id), 'the words were dropped with the last writer').toContain(
        'typed by the first',
      )
    })

    it('keeps words the store refused, so a later flush stores them', async () => {
      await levelOf(first, 'write')
      const prose = new ProseService(drizzle({ client: appPool! }))
      const { caseId, note } = await aNote()
      await actingAs(first, () => prose.open(caseId, note))

      await actingAs(first, () =>
        prose.apply(caseId, note, typed('typed before the revocation'), 'a-socket', { id: first, label: first, headers: {} }),
      )
      await levelOf(first, 'read')
      await prose.flush(caseId, note)
      expect(await stored(note.id), 'a writer without write stored the document').toBe('seed')

      await levelOf(first, 'write')
      await prose.release(caseId, note)

      expect(await stored(note.id), 'a refused flush was taken as stored').toContain(
        'typed before the revocation',
      )
    })
  },
)
