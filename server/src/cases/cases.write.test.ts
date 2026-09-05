/**
 * Patching and deleting a case, attacked rather than demonstrated.
 *
 * **The case row is the one table where `updateVersioned`'s case scoping does
 * not apply**, because `cases` has no `caseId` column - `id` is the scope. So
 * the checks that protect an entity row from a cross-case write are structurally
 * absent here, and what replaces them is tested rather than assumed.
 *
 * **The delete cases are the expensive half.** A case delete cascades into ten
 * entity tables and the change feed, so "it returned 200" says nothing about
 * whether the rows went with it - and a cascade that silently does not fire
 * leaves orphans no screen ever shows.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CASE_COLLECTIONS, CasesService } from './cases.service.js'
import { CasesController } from './cases.controller.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { LibraryService } from '../library/library.service.js'
import { openTestPool } from '../../test/database.js'
import {
  accounts,
  actions,
  caseNotes,
  cloudApps,
  impact,
  malware,
  networkIndicators,
  cases,
  changeFeed,
  evidence,
  reportBlocks,
  reports,
  systems,
  timeline,
  user,
} from '../db/schema/index.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * The handle fixtures arrange rows through.
 *
 * **`ic_seed`, because a fixture writes across cases and the app role may
 * not.** Row-level security refuses an unscoped write, so a fixture on the
 * app handle fails before the test it was arranging ever runs. The subject
 * under test keeps `db` - if it forgets to scope itself, it fails here.
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('writing a case', () => {
  let controller: CasesController
  let service: CasesService
  let library: LibraryService
  let session: { user: { id: string } }
  /** Announcements the channel was asked to make, so a missing one is visible. */
  let announced: { caseId: string; scopes: string[] }[]
  /** Every install-audit line the controller wrote during one test. */
  const audited: unknown[] = []
  /** Who else the presence roster reports on the case. Empty unless a test says otherwise. */
  let present: string[]

  /** A fresh case per test - patching bumps a version every other case would read stale. */
  async function freshCase(): Promise<{ id: string; version: number }> {
    const row = await service.create({ title: 'Under test' }, session.user.id)
    return { id: row.id, version: row.version }
  }

  beforeAll(async () => {
    const actorId = 'case-write-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Case Write Analyst',
        email: 'case-write@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    session = { user: { id: actorId } }

    announced = []
    present = []
    service = new CasesService(db!, {
      announce: (caseId: string, scopes: string[]) => announced.push({ caseId, scopes }),
      othersOn: () => Promise.resolve(present),
    } as never)
    library = new LibraryService(db!, seed)
    await library.seedBuiltIns()
    /**
     * **A recorder rather than the real service**, so the audit assertions
     * below read the call instead of the table. What reaches the database is
     * `install-activity/record.test.ts`'s subject; what this file owes is that
     * the route calls it at all, with the title read *before* the delete.
     *
     * **Stubs the typed methods, not `record`.** The free-form door is the
     * boundary interceptor's alone now, so a stub offering it would let this
     * file pass against a controller reaching for the wrong surface.
     */
    audited.length = 0
    const recorder = (event: string) => (caller: unknown, id: string, title: string) => {
      audited.push({ event, target: title, detail: { caseId: id } })
      return Promise.resolve()
    }
    controller = new CasesController(
      service,
      new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)),
      library,
      {
        caseCreated: recorder('case_created'),
        caseDeleted: recorder('case_deleted'),
      } as never,
    )
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  describe('create from a template', () => {
    /**
     * **Against the shipped rows rather than a fixture template.** A seeder
     * that works on a hand-written payload and not on what the app actually
     * ships is the defect this is looking for - the lifted templates are the
     * only ones an analyst can choose.
     */
    it('seeds the checklist the chosen template carries', async () => {
      const entry = await library.entry('templates', 'ransomware')
      const expected = (entry!.payload as { actions: { task: string }[] }).actions

      const row = await controller.create(
        { title: 'Seeded', template: 'ransomware' },
        session as never,
        { headers: {} },
      )

      const seeded = await seed!.select().from(actions).where(eq(actions.caseId, row.id))
      expect(seeded).toHaveLength(expected.length)
      expect(seeded.map((a) => a.task)).toEqual(expect.arrayContaining(expected.map((a) => a.task)))
      expect(seeded.every((a) => a.createdBy === session.user.id)).toBe(true)
    })

    it('seeds nothing when no template is named', async () => {
      const row = await controller.create({ title: 'Bare' }, session as never, { headers: {} })

      expect(await seed!.select().from(actions).where(eq(actions.caseId, row.id))).toHaveLength(0)
      expect(await seed!.select().from(evidence).where(eq(evidence.caseId, row.id))).toHaveLength(0)
    })

    /**
     * **A 404 must leave no case behind.** The refusal is the whole reason the
     * lookup happens before the insert: a case created and then not seeded is
     * indistinguishable on screen from one whose template had no checklist.
     */
    it('refuses an unknown template without creating the case', async () => {
      const before = (await seed!.select().from(cases)).length

      await expect(
        controller.create({ title: 'Nope', template: 'not-a-template' }, session as never, { headers: {} }),
      ).rejects.toThrow()

      expect((await seed!.select().from(cases)).length).toBe(before)
    })

    /**
     * **The empty string is not "no template".** It is what an unset `<select>`
     * posts, and looking it up would 404 the one path the analyst chose as
     * safe.
     */
    it('treats an empty template name as no template', async () => {
      const row = await controller.create(
        { title: 'Empty name', template: '' },
        session as never,
        { headers: {} },
      )

      expect(await seed!.select().from(actions).where(eq(actions.caseId, row.id))).toHaveLength(0)
    })
  })

  describe('the case document', () => {
    /**
     * **A report is a document, so its sections arriving unordered is not a
     * sorting preference - it is the wrong document.** Every other collection
     * is read in whatever order the table gives; blocks carry a `position` and
     * the rows come back in insertion order often enough that an unordered
     * read looks correct in a test and wrong on screen.
     */
    it('carries the report blocks in position order, not insertion order', async () => {
      const id = (await freshCase()).id
      const [report] = await seed!
        .insert(reports)
        .values({ caseId: id, label: 'Under test', createdBy: session.user.id })
        .returning()

      // Inserted back to front, so insertion order and position disagree.
      for (const position of [3, 1, 2]) {
        await seed!.insert(reportBlocks).values({
          caseId: id,
          reportId: report!.id,
          kind: 'summary',
          position,
          createdBy: session.user.id,
        })
      }

      const document_ = await service.getWithCollections(id)
      expect(document_.reports).toHaveLength(1)
      expect((document_.reportBlocks as { position: number }[]).map((b) => b.position)).toEqual([
        1, 2, 3,
      ])
    })
  })

  describe('the rail summary', () => {
    /**
     * **The point of the endpoint is what it does *not* send.** A test that
     * only checked the counts would pass just as well over the whole document,
     * which is the thing being avoided - so the assertion that carries the
     * feature is that no collection array comes back.
     */
    it('answers with counts and no rows', async () => {
      const id = (await freshCase()).id
      const [report] = await seed!
        .insert(reports)
        .values({ caseId: id, label: 'Filed', createdBy: session.user.id })
        .returning()
      for (const position of [1, 2]) {
        await seed!.insert(reportBlocks).values({
          caseId: id, reportId: report!.id, kind: 'summary', position,
          createdBy: session.user.id,
        })
      }

      const summary = await service.summary(id)
      expect(summary.counts.reports).toBe(1)
      expect(summary.counts.reportBlocks).toBe(2)
      expect(summary.counts.timeline).toBe(0)
      // Every collection is counted, so a rail chip cannot be missing a number.
      expect(Object.keys(summary.counts).sort()).toEqual([...CASE_COLLECTIONS].sort())

      // The reports list is the one collection it carries, for the submenu -
      // and it carries three columns, not the row. A whole row holds
      // `document` (bytea) and `frozen` (jsonb), which is more bytes than the
      // document this endpoint exists to stop sending.
      expect(summary.reports).toHaveLength(1)
      expect(Object.keys(summary.reports[0]!).sort()).toEqual(['id', 'label', 'sentAt'])
      // ...and nothing else is a row.
      const asRecord = summary as unknown as Record<string, unknown>
      for (const name of CASE_COLLECTIONS) {
        if (name === 'reports') continue
        expect(asRecord[name], `${name} rows came back`).toBeUndefined()
      }
    })

    /**
     * **A distinct count per collection, because equal counts hide a swap.**
     * Twelve calls zipped against `CASE_COLLECTIONS` by index leave a swap
     * invisible: the whole server suite stays green, because every seeded
     * collection holds the same number of rows or none. Different
     * numbers are what make the *mapping* observable rather than the set of
     * keys.
     */
    it('counts each collection off its own table', async () => {
      const id = (await freshCase()).id
      // **A different count in every countable collection.** Three was not
      // enough: swapping two collections the test left at zero stayed green,
      // so the five that were never seeded were pinned by nothing.
      const wanted = {
        systems: 3,
        accounts: 2,
        actions: 1,
        networkIndicators: 4,
        malware: 5,
        cloudApps: 6,
        impact: 7,
        casenotes: 8,
      }
      for (let at = 0; at < wanted.systems; at += 1) {
        await seed!.insert(systems).values({
          caseId: id, hostname: `host-${String(at)}`, createdBy: session.user.id,
        })
      }
      for (let at = 0; at < wanted.accounts; at += 1) {
        await seed!.insert(accounts).values({
          caseId: id, accountName: `user-${String(at)}`, createdBy: session.user.id,
        })
      }
      for (let at = 0; at < wanted.actions; at += 1) {
        await seed!.insert(actions).values({
          caseId: id, task: `Contain ${String(at)}`, createdBy: session.user.id,
        })
      }
      for (let at = 0; at < wanted.networkIndicators; at += 1) {
        await seed!.insert(networkIndicators).values({
          caseId: id, type: 'ipv4', value: `203.0.113.${String(at + 1)}`,
          createdBy: session.user.id,
        })
      }
      for (let at = 0; at < wanted.malware; at += 1) {
        await seed!.insert(malware).values({
          caseId: id, filename: `sample-${String(at)}.exe`, createdBy: session.user.id,
        })
      }
      for (let at = 0; at < wanted.cloudApps; at += 1) {
        await seed!.insert(cloudApps).values({
          caseId: id, appName: `app-${String(at)}`, createdBy: session.user.id,
        })
      }
      for (let at = 0; at < wanted.impact; at += 1) {
        await seed!.insert(impact).values({
          caseId: id, label: `impact-${String(at)}`, createdBy: session.user.id,
        })
      }
      for (let at = 0; at < wanted.casenotes; at += 1) {
        await seed!.insert(caseNotes).values({
          caseId: id, note: `note-${String(at)}`, createdBy: session.user.id,
        })
      }

      const summary = await service.summary(id)
      for (const [name, count] of Object.entries(wanted)) {
        expect(summary.counts[name as keyof typeof summary.counts], name).toBe(count)
      }
      expect(summary.counts.evidence).toBe(0)
    })

    it('counts an entry that needs attention without sending the entry', async () => {
      // An event with a tactic and nothing else the tiering expects: gapped by
      // construction. The number is what the rail chip draws.
      const id = (await freshCase()).id
      await seed!.insert(timeline).values({
        caseId: id, kind: 'event', description: 'Beacon', tactic: 'command and control',
        time: new Date('2026-07-24T10:00:00Z'), createdBy: session.user.id,
      })
      const summary = await service.summary(id)
      expect(summary.counts.timeline).toBe(1)
      expect(summary.attention.timeline).toBe(1)
      expect((summary as unknown as Record<string, unknown>)['timeline']).toBeUndefined()
    })

    it('says nothing rather than zero when nothing needs attention', async () => {
      // A present key is a chip, so a zero would draw one reading "0".
      const summary = await service.summary((await freshCase()).id)
      expect(summary.attention).toEqual({})
    })
  })

  describe('patch', () => {
    it('applies the change, bumps the version and attributes it to the caller', async () => {
      const { id, version } = await freshCase()

      const patched = await controller.patch(id, { version, title: 'Renamed' }, session as never)

      expect(patched.title).toBe('Renamed')
      expect(patched.version).toBe(version + 1)
      expect(patched.updatedBy).toBe(session.user.id)
    })

    it('announces the write, or every other open picker keeps the old title', async () => {
      const { id, version } = await freshCase()
      announced.length = 0

      await controller.patch(id, { version, title: 'Announced' }, session as never)

      expect(announced).toContainEqual({ caseId: id, scopes: ['cases'] })
    })

    it('records the fields it changed on the feed, for the merge review to name', async () => {
      const { id, version } = await freshCase()

      await controller.patch(id, { version, title: 'Fed', summary: 'why' }, session as never)

      const rows = await seed!.select().from(changeFeed).where(eq(changeFeed.entityId, id))
      const update = rows.find((r) => r.op === 'update')
      expect(update?.fields).toEqual(expect.arrayContaining(['title', 'summary']))
    })

    /**
     * **A refused write must not announce.** The announcement is what makes
     * every other open screen refetch, so publishing one for a write that did
     * not happen sends every analyst on the case to the database to be told
     * nothing changed - and, worse, reads as confirmation to the analyst whose
     * save was just refused.
     */
    it('does not announce a patch it refused', async () => {
      const { id, version } = await freshCase()
      await controller.patch(id, { version, title: 'First' }, session as never)
      announced.length = 0

      await expect(
        controller.patch(id, { version, title: 'Second' }, session as never),
      ).rejects.toThrow()

      expect(announced).toHaveLength(0)
    })

    /**
     * **Clearing a closure time is a real edit**, not an omission: a case
     * closed by mistake and reopened has to be able to lose the stamp. `null`
     * and absent mean different things here, and `.nullable()` is what keeps
     * them apart.
     */
    it('clears closedAt when the caller sends null', async () => {
      const { id, version } = await freshCase()
      const closed = await controller.patch(
        id,
        { version, status: 'closed', closedAt: new Date().toISOString() },
        session as never,
      )
      expect(closed.closedAt).not.toBeNull()

      const reopened = await controller.patch(
        id,
        { version: closed.version, status: 'open', closedAt: null },
        session as never,
      )

      expect(reopened.closedAt).toBeNull()
    })

    /**
     * **Whitespace is the realistic empty title.** A form sends `"   "` where a
     * test sends `""`, and `.min(1)` alone would accept it - the `.trim()` in
     * front is what makes the rule mean what it says.
     */
    it('refuses a title that is only whitespace', async () => {
      const { id, version } = await freshCase()
      await expect(
        controller.patch(id, { version, title: '   ' }, session as never),
      ).rejects.toMatchObject({ response: { message: 'Validation failed' } })
    })

    /**
     * **`z.coerce.date()` accepts anything `new Date()` does**, which is more
     * than it looks: an unparseable string becomes `Invalid Date` rather than
     * throwing. Zod's date check is what rejects it, so this pins that the
     * coercion is not the whole gate.
     */
    it('refuses a date that does not parse', async () => {
      const { id, version } = await freshCase()
      await expect(
        controller.patch(id, { version, openedAt: 'last thursday' }, session as never),
      ).rejects.toMatchObject({ response: { message: 'Validation failed' } })
    })

    it('refuses a patch that names no version', async () => {
      const { id } = await freshCase()
      await expect(controller.patch(id, { title: 'X' }, session as never)).rejects.toMatchObject({
        response: { message: /version it read/ },
      })
    })

    /**
     * **A string version is the realistic form of this mistake**, not a missing
     * one - a client that reads the version out of a URL or a form field has a
     * string, and `Number.isInteger('1')` is false while `Number('1')` is 1. A
     * check written as a truthiness test would let it through and then compare
     * a string against an integer column.
     */
    it('refuses a version that is a string rather than an integer', async () => {
      const { id, version } = await freshCase()
      await expect(
        controller.patch(id, { version: String(version), title: 'X' }, session as never),
      ).rejects.toMatchObject({ response: { message: /version it read/ } })
    })

    it('refuses a patch that changes nothing', async () => {
      const { id, version } = await freshCase()
      await expect(controller.patch(id, { version }, session as never)).rejects.toMatchObject({
        response: { message: /change something/ },
      })
    })

    /**
     * The lost update the whole layer exists for. **The refusal has to carry the
     * version the row reached**, because the caller's next move is a merge
     * review and they cannot word one without it.
     */
    it('refuses a stale version and says what the row reached', async () => {
      const { id, version } = await freshCase()
      await controller.patch(id, { version, title: 'First' }, session as never)

      await expect(
        controller.patch(id, { version, title: 'Second' }, session as never),
      ).rejects.toMatchObject({ response: { currentVersion: version + 1 } })
    })

    /**
     * **404 and 409 are different answers and the code has to tell them apart.**
     * Both arrive here as "no row matched"; answering 409 for a case that does
     * not exist tells a client to go and merge against nothing.
     */
    it('answers 404 for a case that does not exist, not a conflict', async () => {
      await expect(
        controller.patch(
          '00000000-0000-0000-0000-000000000000',
          { version: 1, title: 'X' },
          session as never,
        ),
      ).rejects.toMatchObject({ status: 404 })
    })

    it.each([
      ['id', { id: '00000000-0000-0000-0000-000000000000' }],
      ['isDemo', { isDemo: true }],
      ['createdBy', { createdBy: 'someone-else' }],
      ['updatedBy', { updatedBy: 'someone-else' }],
      ['createdAt', { createdAt: new Date().toISOString() }],
      ['updatedAt', { updatedAt: new Date().toISOString() }],
    ])('refuses a patch that sets %s', async (_field, extra) => {
      const { id, version } = await freshCase()
      await expect(
        controller.patch(id, { version, ...extra }, session as never),
      ).rejects.toMatchObject({ response: { message: 'Validation failed' } })
    })

    /**
     * **The RSIT pair is refused before the columns exist**, which is the point.
     * They validate together and go in one write; a one-field-at-a-time PATCH
     * drops half of it and leaves a combination the validator refuses. Adding
     * the columns later must not silently make this route accept them.
     * -> `ui/src/api/specsResidual.ts`
     */
    it.each([['rsitClass'], ['rsitType']])('refuses %s, which is a paired write', async (field) => {
      const { id, version } = await freshCase()
      await expect(
        controller.patch(id, { version, [field]: 'anything' }, session as never),
      ).rejects.toMatchObject({ response: { message: 'Validation failed' } })
    })

    /**
     * **Closing a case does not invent a closure time**, and this is a
     * deliberate divergence from Python, which stamps one on close.
     * `db/schema/case.ts` says null-while-closed is distinct from a recorded
     * time and is the only evidence that none was captured - stamping `now()`
     * destroys exactly the distinction the column was designed to keep.
     */
    it('closing a case leaves closedAt null unless the caller set one', async () => {
      const { id, version } = await freshCase()

      const closed = await controller.patch(id, { version, status: 'closed' }, session as never)

      expect(closed.status).toBe('closed')
      expect(closed.closedAt).toBeNull()
    })

    it('accepts a closedAt the caller does supply', async () => {
      const { id, version } = await freshCase()
      const when = new Date('2026-03-04T05:06:07.000Z')

      const closed = await controller.patch(
        id,
        { version, status: 'closed', closedAt: when.toISOString() },
        session as never,
      )

      // `string | Date`: the handler answers with what the column returned, and
      // the serializer interceptor - which no direct call runs - is what turns
      // it into the ISO string a client sees. -> `readStamp`
      expect(new Date(closed.closedAt!).toISOString()).toBe(when.toISOString())
    })
  })

  describe('delete', () => {
    /**
     * **The cascade is the assertion, not the 200.** Ten entity tables and the
     * change feed hang off `case_id`; a delete that leaves them behind produces
     * rows no screen can ever reach and no query will ever clean up.
     */
    it('takes the entity rows with it', async () => {
      await seed!.delete(cases)
      await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
      const [demo] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
      const id = demo!.id
      // The fixture has to have rows, or the cascade assertion passes vacuously.
      expect((await seed!.select().from(timeline).where(eq(timeline.caseId, id))).length)
        .toBeGreaterThan(0)

      await controller.remove(id, session as never, { headers: {} })

      expect(await seed!.select().from(cases).where(eq(cases.id, id))).toHaveLength(0)
      expect(await seed!.select().from(timeline).where(eq(timeline.caseId, id))).toHaveLength(0)
      expect(await seed!.select().from(systems).where(eq(systems.caseId, id))).toHaveLength(0)
      expect(await seed!.select().from(changeFeed).where(eq(changeFeed.caseId, id))).toHaveLength(0)
    })

    it('answers 404 for a case that does not exist', async () => {
      await expect(
        controller.remove('00000000-0000-0000-0000-000000000000', session as never, { headers: {} }),
      ).rejects.toMatchObject({ status: 404 })
    })

    /**
     * **The one destructive act no version check guards.** `cases.version`
     * moves on a case *field* edit, so it is unmoved by an analyst who has
     * spent an hour adding timeline entries - the row they would lose is not
     * the row being checked. Presence is the only thing that knows the case is
     * occupied.
     */
    it('refuses to delete a case another analyst is working in', async () => {
      const { id } = await freshCase()
      present = ['Sam']

      await expect(controller.remove(id, session as never, { headers: {} })).rejects.toMatchObject({
        status: 409,
      })
      expect(await seed!.select().from(cases).where(eq(cases.id, id))).toHaveLength(1)
    })

    /**
     * **Named, because a refusal an analyst cannot act on is a dead end.**
     * "Someone else is here" leaves them staring at a case they cannot delete
     * and cannot find the occupant of.
     */
    it('names who is in the case when it refuses', async () => {
      const { id } = await freshCase()
      present = ['Sam', 'Alex']

      await expect(controller.remove(id, session as never, { headers: {} })).rejects.toMatchObject({
        response: { message: expect.stringContaining('Sam') },
      })
    })

    /**
     * **Your own second tab is not another analyst.** The roster is per
     * connection, so a check that counted rows rather than distinct people
     * would refuse every delete made with the case open - which is every
     * delete made from the case screen.
     *
     * **What this test cannot see: the filtering itself.** The fake channel
     * returns `present` verbatim, so the `userId` comparison that excludes the
     * caller lives in the real `CaseChannel.othersOn` and is stubbed away
     * here. What is asserted is only that an empty roster permits the delete.
     * The exclusion is held by `case-channel.service.test.ts`, over a store
     * that keeps the roster's semantics.
     */
    it('deletes when nobody else is present', async () => {
      const { id } = await freshCase()
      present = []

      await expect(controller.remove(id, session as never, { headers: {} })).resolves.toEqual({})
    })

    /**
     * **A demo deletes like anything else, and that is the decision.**
     * `db/schema/case.ts`: a demo is reset rather than protected, and the reset
     * is the server restart. Refusing the delete would be a second code path
     * through every write in the app for a case that is rebuilt anyway - this
     * test exists so that refusal is not added later as an obvious kindness.
     */
    it('deletes a demo case rather than protecting it', async () => {
      await seed!.delete(cases)
      await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
      const [demo] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-014'))
      expect(demo!.isDemo).toBe(true)

      await controller.remove(demo!.id, session as never, { headers: {} })

      expect(await seed!.select().from(cases).where(eq(cases.id, demo!.id))).toHaveLength(0)
    })

    /**
     * **Announced even though the feed row cannot survive.** The change feed
     * cascades with the case, so a delete has no durable record to replay - the
     * only way an analyst standing in the case learns it is gone is the live
     * frame, and it has to be published rather than written.
     */
    it('announces the delete, which the cascaded feed cannot do for it', async () => {
      const { id } = await freshCase()
      announced.length = 0

      await controller.remove(id, session as never, { headers: {} })

      expect(announced).toContainEqual({ caseId: id, scopes: ['cases'] })
    })

    /**
     * **`change_feed` cascades with the case**, so the per-case log is
     * destroyed by the one event it would most need to record. The install
     * audit is the only thing left that can say a case existed.
     *
     * The title is asserted rather than the id, because that is the half a
     * read-after-delete cannot recover - and reading it after `remove` returns
     * an empty line while every other assertion here still passes.
     */
    it('records the delete on the install audit, with the title it had', async () => {
      /**
       * **A title only this case carries.** `expect.any(String)` was what
       * stood here, and it holds for `''`, for the id, or for any other
       * case's title -- none of which is "the title it had". Every
       * `freshCase` is called *Under test*, so the fixture is made distinct
       * rather than reused.
       */
      const title = 'Ransomware at the Rotterdam depot'
      const row = await service.create({ title }, session.user.id)
      audited.length = 0

      await controller.remove(row.id, session as never, { headers: {} })

      expect(audited).toContainEqual(
        expect.objectContaining({
          event: 'case_deleted',
          target: title,
          detail: { caseId: row.id },
        }),
      )
    })
  })
})
