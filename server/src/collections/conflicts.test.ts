/**
 * The merge review: what a refused save disagreed about, and the two answers.
 *
 * **The property under attack is that the dialog is rare.** A review that
 * appears for every concurrent edit trains an analyst to click the same button
 * every time, which is worse than no review - so most of these go at the cases
 * that must *not* raise one: a field only this analyst moved, a field only the
 * other moved, and a re-save of an identical value.
 *
 * **`theirs` is read live and never stored**, so a case where the row moves
 * again between the refusal and the review is a real one rather than a nicety.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConflictsService } from './conflicts.service.js'
import { CollectionService } from './collection.service.js'
import { SystemsController } from './entities.controller.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases, conflicts, reports, systems, user } from '../db/schema/index.js'
import { reportBlocks } from '../db/schema/report.js'
import { openTestPool } from '../../test/database.js'
import { randomUUID } from 'node:crypto'

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

const ME = 'analyst-mine'
const THEM = 'analyst-theirs'

describe.skipIf(!db)('the merge review', () => {
  let service: ConflictsService
  let collections: CollectionService
  let caseId: string
  let rowId: string

  async function seedAnalyst(id: string): Promise<void> {
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id,
        name: id,
        email: `${id}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }

  beforeEach(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
    const [kase] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    caseId = kase!.id
    await seedAnalyst(ME)
    await seedAnalyst(THEM)
    const [row] = await seed!.select().from(systems).where(eq(systems.caseId, caseId))
    rowId = row!.id
    /**
     * **A known starting value, because `base` has to be the truth.** These
     * tests hand the service a `base` the way a client would - and a `base`
     * invented rather than read makes every field look moved by the other
     * analyst, which is a fixture bug that reads exactly like a real defect.
     */
    await seed!.update(systems).set({ analyst: 'Nobody' }).where(eq(systems.id, rowId))

    service = new ConflictsService(db!)
    collections = new CollectionService(db!)
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  /** The other analyst's write, so `theirs` is a real value rather than a fixture. */
  async function theyWrite(patch: Record<string, unknown>): Promise<void> {
    const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
    await collections.update(
      { name: 'systems', table: systems, orderBy: 'id' },
      caseId,
      rowId,
      row!.version,
      patch,
      THEM,
    )
  }

  describe('what counts as a disagreement', () => {
    /**
     * **Both sides moved the same field.** This is the only shape that is a
     * real question, and the one the dialog exists for.
     */
    it('raises a review when both analysts moved the same field', async () => {
      await theyWrite({ analyst: 'Them' })

      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Me' },
      })

      const [review] = await service.pending(caseId, ME)
      expect(review!.fields).toEqual([
        { field: 'analyst', base: 'Nobody', mine: 'Me', theirs: 'Them' },
      ])
    })

    /**
     * **Only this analyst moved it, so there is nothing to ask.** The version
     * bumped because the other analyst wrote a *different* field - refusing the
     * whole row on that basis is what makes a merge prompt worthless.
     */
    it('raises nothing when only this analyst moved the field', async () => {
      await theyWrite({ hostname: 'THEIRS-01' })

      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Me' },
      })

      expect(await service.pending(caseId, ME)).toEqual([])
    })

    /**
     * **Both wrote the same value, which is agreement.** Two analysts typing
     * the same verdict have not disagreed, and asking them to choose between
     * two identical strings is the review at its most absurd.
     */
    it('raises nothing when both analysts wrote the same value', async () => {
      await theyWrite({ analyst: 'Same' })

      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Same' },
      })

      expect(await service.pending(caseId, ME)).toEqual([])
    })

    /**
     * **`theirs` is read at review time, not at refusal time.** The other
     * analyst can write again while the dialog is unanswered, and a stored copy
     * would ask about a value that is no longer on the row.
     */
    it('reports what the row says now, not what it said when the save was refused', async () => {
      await theyWrite({ analyst: 'First' })
      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Me' },
      })

      await theyWrite({ analyst: 'Second' })

      const [review] = await service.pending(caseId, ME)
      expect(review!.fields[0]!.theirs).toBe('Second')
    })
  })

  describe('what the review says', () => {
    it('names the row by something an analyst has seen, never the id', async () => {
      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      await theyWrite({ analyst: 'Them' })
      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Me' },
      })

      const [review] = await service.pending(caseId, ME)
      expect(review!.label).toBe(row!.hostname)
      expect(review!.label).not.toBe(rowId)
    })

    /**
     * **A report is named by `label`, which the candidate list omitted.**
     *
     * Found by looking at the screen rather than by reading: a held review on
     * the demo case's report opened over the report itself reading
     * `e79ef1da-1277-4823-8780-fb20b53b1bd7`. None of the nine fields the
     * labeller tries is one a report has, so it fell back to the id -- and the
     * fallback is meant for a row with genuinely nothing to call it, not for
     * the entity whose name field simply was not on the list.
     */
    it('names a report by the label an analyst gave it', async () => {
      const reportId = randomUUID()
      await seed!.insert(reports).values({
        id: reportId,
        caseId,
        label: 'Customer RCA',
        createdBy: ME,
        updatedBy: ME,
      })

      await service.record({
        caseId,
        userId: ME,
        entity: 'reports',
        entityId: reportId,
        base: { tlp: 'TLP:RED' },
        mine: { tlp: 'TLP:AMBER' },
      })

      const [review] = await service.pending(caseId, ME)
      expect(review!.label).toBe('Customer RCA')
      expect(review!.label).not.toBe(reportId)
    })

    /**
     * **A row the labeller cannot look up reads as deleted, and a report could
     * not be looked up.**
     *
     * `rowById` resolved through the *bulk-delete* target list -- the ten
     * collections a selection may name -- which has never included reports. So
     * every merge review on a report answered `deletedByThem`, told the analyst
     * someone had deleted the report while they were editing it, and offered to
     * put it back. Nothing had been deleted. Seen on screen over the demo
     * case's own report before it was traced.
     */
    it('does not claim a report was deleted when it is still there', async () => {
      const reportId = randomUUID()
      await seed!.insert(reports).values({
        id: reportId,
        caseId,
        label: 'Still here',
        tlp: 'TLP:RED',
        createdBy: ME,
        updatedBy: ME,
      })
      await seed!.update(reports).set({ tlp: 'TLP:GREEN' }).where(eq(reports.id, reportId))

      await service.record({
        caseId,
        userId: ME,
        entity: 'reports',
        entityId: reportId,
        base: { tlp: 'TLP:RED' },
        mine: { tlp: 'TLP:AMBER' },
      })

      const [review] = await service.pending(caseId, ME)
      expect(review!.deletedByThem, 'the report is still there').toBe(false)
      expect(review!.fields.map((one) => one.field)).toEqual(['tlp'])
    })

    /**
     * **A list is joined, not rendered as an array literal.** A reference list
     * is the one non-scalar an entity carries, and `["s-1","s-2"]` on a
     * confirmation screen asks an analyst to read JSON.
     */
    it('renders a list as prose rather than as JSON', async () => {
      expect(ConflictsService.rendered(['s-1', 's-2'])).toBe('s-1, s-2')
      expect(ConflictsService.rendered(true)).toBe('yes')
      expect(ConflictsService.rendered(null)).toBe('')
    })

    it('says so when the other analyst deleted the row', async () => {
      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Me' },
      })
      await seed!.delete(systems).where(eq(systems.id, rowId))

      const [review] = await service.pending(caseId, ME)
      expect(review!.deletedByThem).toBe(true)
      expect(review!.fields).toEqual([])
    })
  })

  describe('whose review it is', () => {
    it('is not offered to the other analyst', async () => {
      await theyWrite({ analyst: 'Them' })
      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Me' },
      })

      expect(await service.pending(caseId, THEM)).toEqual([])
    })

    /**
     * **A second refusal on the same row replaces the first.** It is the same
     * disagreement seen again, and two entries differing only in age is a queue
     * nobody asked for.
     */
    it('keeps one review per row however many times the save is refused', async () => {
      await theyWrite({ analyst: 'Them' })
      for (const mine of ['One', 'Two', 'Three']) {
        await service.record({
          caseId,
          userId: ME,
          entity: 'systems',
          entityId: rowId,
          base: { analyst: 'Nobody' },
          mine: { analyst: mine },
        })
      }

      const reviews = await service.pending(caseId, ME)
      expect(reviews).toHaveLength(1)
      expect(reviews[0]!.fields[0]!.mine).toBe('Three')
    })
  })

  /**
   * **The wiring, not the service.** Everything above calls `record` directly,
   * which proves the review works and says nothing about whether a refused
   * PATCH ever reaches it - the exact gap where a feature is fully built,
   * fully tested and never invoked.
   */
  describe('a refused PATCH leaves a review behind', () => {
    it('records the analyst edit that the 409 discarded', async () => {
      const controller = new SystemsController(collections, service)
      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      await theyWrite({ analyst: 'Them' })

      await expect(
        controller.update(
          caseId,
          rowId,
          { version: row!.version, base: { analyst: 'Nobody' }, analyst: 'Me' },
          { user: { id: ME } } as never,
        ),
      ).rejects.toMatchObject({ status: 409 })

      const [review] = await service.pending(caseId, ME)
      expect(review!.fields).toEqual([
        { field: 'analyst', base: 'Nobody', mine: 'Me', theirs: 'Them' },
      ])
    })

    /**
     * **`base` must not reach the column validator.** It rides with the patch
     * and is not part of it, so a strict parse would refuse the whole save as
     * naming an unknown field - turning every conflict-aware client into one
     * that cannot write at all.
     */
    it('does not treat base as a column to write', async () => {
      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      const controller = new SystemsController(collections, service)

      const updated = (await controller.update(
        caseId,
        rowId,
        { version: row!.version, base: { analyst: 'Nobody' }, analyst: 'Me' },
        { user: { id: ME } } as never,
      )) as Record<string, unknown>

      expect(updated['analyst']).toBe('Me')
      expect(updated).not.toHaveProperty('base')
    })
  })

  /**
   * **The claim is what makes a review rare, and it was advisory until now.**
   * Measured 2026-08-09: claims lived only in `live/` and no write path read
   * one, in Node or in Python - so "checked out until saved or discarded" was
   * true of the pencil and false of the API.
   *
   * **It does not replace the version check**, and these cases are written so
   * that is visible: a claim is released when its socket goes, so a dropped
   * connection frees the row and the next analyst writes legitimately.
   */
  describe('a row another analyst holds', () => {
    /**
     * **The fake records what it was asked**, because the whole of this
     * feature is the lookup key. A `holderOf` that ignores its arguments
     * certifies that *a* refusal happens and nothing about *which row* was
     * checked - measured 2026-08-10, asking for a collection that does not
     * exist left all 470 tests green while the refusal silently never fired.
     */
    let asked: unknown[] = []
    function holding(holder: { userId: string; username: string } | null): CollectionService {
      asked = []
      return new CollectionService(db!, {
        announce: () => {},
        holderOf: (...args: unknown[]) => {
          asked = args
          return Promise.resolve(holder)
        },
      } as never)
    }

    it('refuses a patch to a row somebody else has open', async () => {
      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      const guarded = holding({ userId: THEM, username: 'Them' })

      await expect(
        guarded.update(
          { name: 'systems', table: systems, orderBy: 'id' },
          caseId,
          rowId,
          row!.version,
          { analyst: 'Me' },
          ME,
        ),
      ).rejects.toMatchObject({ status: 409 })
    })

    /**
     * **Which row was asked about, not merely that something was.** The key
     * has three vertices that must agree - the collection name the UI claims
     * with, the string the gateway passes through unvalidated, and `def.name`
     * here - and nothing else pins them together.
     */
    it('asks about the row being written, by case, collection and id', async () => {
      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      const guarded = holding(null)

      await guarded.update(
        { name: 'systems', table: systems, orderBy: 'id' },
        caseId,
        rowId,
        row!.version,
        { analyst: 'Me' },
        ME,
      )

      expect(asked).toEqual([caseId, 'systems', rowId])
    })

    it('names the holder, or the refusal is a dead end', async () => {
      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      const guarded = holding({ userId: THEM, username: 'Them' })

      await expect(
        guarded.update(
          { name: 'systems', table: systems, orderBy: 'id' },
          caseId,
          rowId,
          row!.version,
          { analyst: 'Me' },
          ME,
        ),
      ).rejects.toMatchObject({ response: { message: expect.stringContaining('Them') } })
    })

    /**
     * **Holding your own claim must not lock you out**, which is the failure
     * that would make the feature unusable: the analyst editing a row is
     * exactly the analyst who holds it, so a check on presence rather than
     * identity refuses every save made from an open dialog.
     */
    it('lets the holder write to the row they hold', async () => {
      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      const guarded = holding({ userId: ME, username: 'Me' })

      const result = await guarded.update(
        { name: 'systems', table: systems, orderBy: 'id' },
        caseId,
        rowId,
        row!.version,
        { analyst: 'Me' },
        ME,
      )

      expect(result.ok).toBe(true)
    })

    it('lets anyone write to a row nobody holds', async () => {
      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      const guarded = holding(null)

      const result = await guarded.update(
        { name: 'systems', table: systems, orderBy: 'id' },
        caseId,
        rowId,
        row!.version,
        { analyst: 'Me' },
        ME,
      )

      expect(result.ok).toBe(true)
    })
  })

  /**
   * **The read half of the cross-case hole `updateVersioned` closed.**
   *
   * A patch to `/api/cases/A/systems/<row in B>` is refused - the write is
   * scoped, correctly - and the refusal then *records* a review. If the review
   * looks its row up by id alone it stores B's label and serves B's field
   * values back under case A, so an analyst with access to A reads a row in B
   * by naming its id. On an MXDR install that is a read across customers.
   *
   * **`CaseAccessGuard` does not close it**: it asserts the case in the URL
   * exists, which is true and beside the point.
   */
  describe('a row id belonging to another case', () => {
    it('does not leak the other case row through the review', async () => {
      const [other] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-014'))
      const [theirRow] = await seed!.select().from(systems).where(eq(systems.caseId, other!.id))
      expect(theirRow).toBeDefined()

      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: theirRow!.id,
        base: { hostname: 'guess' },
        mine: { hostname: 'mine' },
      })

      const reviews = await service.pending(caseId, ME)
      const shown = JSON.stringify(reviews)
      expect(shown).not.toContain(theirRow!.hostname)
    })

    /**
     * **Reads as deleted, which is the right answer.** From inside case A that
     * row does not exist, and saying so leaks nothing - where naming it, or
     * showing its values, leaks both.
     */
    it('treats it as a row that is gone rather than one it can read', async () => {
      const [other] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-014'))
      const [theirRow] = await seed!.select().from(systems).where(eq(systems.caseId, other!.id))

      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: theirRow!.id,
        base: {},
        mine: { hostname: 'mine' },
      })

      const [review] = await service.pending(caseId, ME)
      expect(review!.deletedByThem).toBe(true)
      expect(review!.label).toBe(theirRow!.id)
    })

    /** And answering "keep mine" must not write into the other case either. */
    it('does not write into the other case when the review is resolved', async () => {
      const [other] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-014'))
      const [theirRow] = await seed!.select().from(systems).where(eq(systems.caseId, other!.id))
      const before = theirRow!.hostname

      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: theirRow!.id,
        base: { hostname: 'guess' },
        mine: { hostname: 'OVERWRITTEN' },
      })
      await service.resolve(caseId, ME, 'mine')

      const [after] = await seed!.select().from(systems).where(eq(systems.id, theirRow!.id))
      expect(after!.hostname).toBe(before)
    })
  })

  describe('answering it against a sent report', () => {
    /**
     * **The sixth door.** `refuseIfClosed` is wired at the five
     * `CollectionService` write methods; `resolve` writes through
     * `updateVersioned` directly.
     *
     * The route is ordinary rather than contrived: a refused `PATCH` records
     * the analyst's values, the report is sent, and answering the review that
     * is already on their screen replays those values into it.
     */
    it('refuses to write a kept-mine value into a report that has been sent', async () => {
      const reportId = randomUUID()
      await seed!.insert(reports).values({
        id: reportId,
        caseId,
        label: 'Before it was sent',
        tlp: 'TLP:RED',
        createdBy: ME,
        updatedBy: ME,
      })

      await service.record({
        caseId,
        userId: ME,
        entity: 'reports',
        entityId: reportId,
        base: { label: 'Before it was sent' },
        mine: { label: 'AFTER IT WAS SENT' },
      })

      await seed!.update(reports).set({ sentAt: new Date() }).where(eq(reports.id, reportId))

      await expect(service.resolve(caseId, ME, 'mine')).rejects.toThrow(/sent report/i)

      const [row] = await seed!.select().from(reports).where(eq(reports.id, reportId))
      expect(row!.label, 'the frozen report kept its own label').toBe('Before it was sent')
    })

    /**
     * **A refusal that deletes the record is worse than the write it
     * prevented.** `resolve` drops every held row unconditionally and reports
     * `settled`, so a refused resolution would otherwise destroy the analyst's
     * recorded values and tell them it worked -- the same shape the comment
     * above the `REVIEWABLE` lookup says was already fixed once.
     */
    it('keeps the review when the write it would make is refused', async () => {
      const reportId = randomUUID()
      await seed!.insert(reports).values({
        id: reportId,
        caseId,
        label: 'Original',
        tlp: 'TLP:RED',
        createdBy: ME,
        updatedBy: ME,
      })
      await service.record({
        caseId,
        userId: ME,
        entity: 'reports',
        entityId: reportId,
        base: { label: 'Original' },
        mine: { label: 'Mine' },
      })
      // All three values differ, or `pending` settles the record as agreement
      // and the assertion below passes for the wrong reason.
      await seed!
        .update(reports)
        .set({ label: 'Theirs', sentAt: new Date() })
        .where(eq(reports.id, reportId))

      await expect(service.resolve(caseId, ME, 'mine')).rejects.toThrow()

      expect(
        await service.pending(caseId, ME),
        'the analyst can still see what they had written',
      ).toHaveLength(1)
    })

    /**
     * The `report_blocks` arm of the same guard, which nothing held. The
     * block's parent is looked up rather than named.
     */
    it('refuses a kept-mine value on a block whose report has been sent', async () => {
      const reportId = randomUUID()
      await seed!.insert(reports).values({
        id: reportId,
        caseId,
        label: 'Parent',
        tlp: 'TLP:RED',
        createdBy: ME,
        updatedBy: ME,
      })
      const [block] = await seed!
        .insert(reportBlocks)
        .values({
          caseId,
          reportId,
          kind: 'written',
          heading: 'Before it was sent',
          position: 0,
          createdBy: ME,
          updatedBy: ME,
        })
        .returning()

      await service.record({
        caseId,
        userId: ME,
        entity: 'report_blocks',
        entityId: block!.id,
        base: { heading: 'Before it was sent' },
        mine: { heading: 'AFTER IT WAS SENT' },
      })
      await seed!.update(reports).set({ sentAt: new Date() }).where(eq(reports.id, reportId))

      await expect(service.resolve(caseId, ME, 'mine')).rejects.toThrow(/sent report/i)

      const [after] = await seed!
        .select()
        .from(reportBlocks)
        .where(eq(reportBlocks.id, block!.id))
      expect(after!.heading, 'the frozen report kept its section').toBe('Before it was sent')
    })

    /**
     * **The version race, which the sent-report tests above do not reach.**
     * Removing the `ok` check leaves both of them green: the guard throws
     * first, so they never exercise a write that was *attempted* and refused.
     *
     * **The stale version is injected rather than raced for.** `resolve` reads
     * the row and writes it microseconds later, so a real interleaving is not
     * reproducible in a single-threaded test -- and the defect is not the
     * timing, it is that `updateVersioned`'s answer was discarded. Holding
     * `rowById` to a version that has moved is that answer, deterministically.
     */
    it('keeps the review when the row moved between the read and the write', async () => {
      await theyWrite({ analyst: 'Them' })
      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Me' },
      })

      const [current] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      const stale = { ...current!, version: current!.version - 1 }
      const reader = vi
        .spyOn(service as unknown as { rowById: () => unknown }, 'rowById')
        .mockResolvedValue(stale)

      try {
        await expect(service.resolve(caseId, ME, 'mine')).rejects.toThrow(/while this review/i)
      } finally {
        reader.mockRestore()
      }

      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      expect(row!.analyst, 'the refused write did not land').toBe('Them')
      expect(await service.pending(caseId, ME), 'and the record survived it').toHaveLength(1)
    })
  })

  describe('answering it', () => {
    it('keeping mine writes my value over theirs and settles the review', async () => {
      await theyWrite({ analyst: 'Them' })
      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Me' },
      })

      expect(await service.resolve(caseId, ME, 'mine')).toEqual({ settled: 1 })

      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      expect(row!.analyst).toBe('Me')
      expect(await service.pending(caseId, ME)).toEqual([])
    })

    /**
     * **Keeping mine is still an attributed write.** It is this analyst
     * overwriting another's value on purpose, which is exactly the write the
     * change record exists to name.
     */
    it('attributes a kept-mine write to the analyst who chose it', async () => {
      await theyWrite({ analyst: 'Them' })
      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Me' },
      })

      await service.resolve(caseId, ME, 'mine')

      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      expect(row!.updatedBy).toBe(ME)
    })

    it('taking theirs leaves the row alone and settles the review', async () => {
      await theyWrite({ analyst: 'Them' })
      await service.record({
        caseId,
        userId: ME,
        entity: 'systems',
        entityId: rowId,
        base: { analyst: 'Nobody' },
        mine: { analyst: 'Me' },
      })

      expect(await service.resolve(caseId, ME, 'theirs')).toEqual({ settled: 1 })

      const [row] = await seed!.select().from(systems).where(eq(systems.id, rowId))
      expect(row!.analyst).toBe('Them')
      expect(await service.pending(caseId, ME)).toEqual([])
    })

    /**
     * **Answering settles only this analyst's reviews.** Two analysts can each
     * hold a refused save against the same row, and one of them clicking a
     * button must not answer the other's question for them.
     */
    it('settles only the answering analyst', async () => {
      await theyWrite({ analyst: 'Them' })
      for (const who of [ME, THEM]) {
        await service.record({
          caseId,
          userId: who,
          entity: 'systems',
          entityId: rowId,
          base: { analyst: 'Nobody' },
          mine: { analyst: `${who} says` },
        })
      }

      await service.resolve(caseId, ME, 'theirs')

      expect(await seed!.select().from(conflicts).where(eq(conflicts.userId, THEM))).toHaveLength(1)
    })

    it('answering nothing is not an error', async () => {
      expect(await service.resolve(caseId, ME, 'theirs')).toEqual({ settled: 0 })
    })
  })
})
