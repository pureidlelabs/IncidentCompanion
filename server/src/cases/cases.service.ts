/**
 * Reading and creating cases.
 *
 * **Every write names its author, and there is no default.** `actorId` is a
 * required argument rather than something resolved in here, because the one
 * thing that must never happen is a write attributed to whoever happened to be
 * convenient. The caller has the session; this layer does not go looking for
 * one.
 */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common'
import { and, asc, desc, eq, getTableColumns, ne, sql } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import { defaultCustomer } from '../customers/customers.service.js'
import type { Database } from '../db/client.js'
import { updateVersioned, type WriteResult } from '../db/mutate.js'
import { CaseChannel } from '../live/case-channel.service.js'
import { LiveGateway } from '../live/live.gateway.js'
import { timelineToWire } from '../domain/entities/timeline.js'
import { isGapped } from '../domain/tiering.js'
import { SEVERITY } from '../domain/vocabularies.js'
import { withCase, withReach, type Executor } from '../db/scope.js'
import { inSeries } from '../db/in-series.js'
import { columnOf } from '../db/column-access.js'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { Transaction } from '../db/client.js'
import type { CaseTemplate } from '../library/kinds.js'

export type CaseSeed = CaseTemplate
import {
  accounts,
  cases,
  changeFeed,
  cloudApps,
  customers,
  evidence,
  reportBlocks,
  reports,
  impact,
  malware,
  methods,
  networkIndicators,
  systems,
  timeline,
  actions,
  caseNotes,
  type CaseRow,
} from '../db/schema/index.js'

/**
 * Re-exported: the list moved to `domain/collections.ts` so the client can
 * read it through `@contract/*` rather than restate twelve strings.
 */
export { CASE_COLLECTIONS, type CaseCollection } from '../domain/collections.js'
// Imported as well as re-exported: `export ... from` creates no local binding,
// and this file reads the list twice below.
import { CASE_COLLECTIONS, type CaseCollection } from '../domain/collections.js'

/**
 * Which table holds each collection's rows.
 *
 * **`satisfies Record<CaseCollection, PgTable>`, so a collection added to
 * `CASE_COLLECTIONS` and forgotten here is a compile error** - where a
 * positional array keeps compiling and mislabels every count from the
 * insertion point on.
 */
const COUNTED = {
  timeline,
  systems,
  accounts,
  networkIndicators,
  impact,
  malware,
  cloudApps,
  evidence,
  methods,
  actions,
  casenotes: caseNotes,
  reports,
  reportBlocks,
} satisfies Record<CaseCollection, PgTable>

/**
 * What a rail needs to draw itself: the case, a tally per collection, the
 * attention numbers, and the reports the submenu lists.
 *
 * **`attention` is sparse on purpose** - a present key is a chip, so an absent
 * one is how "nothing to flag" is said.
 */
export interface CaseSummary extends CaseRow {
  counts: Record<CaseCollection, number>
  attention: Partial<Record<CaseCollection, number>>
  reports: ReportStub[]
}

/**
 * The three columns the rail's report submenu draws, and no more.
 *
 * **A whole `reports` row carries `document` (bytea) and `frozen` (jsonb)**, so
 * a `select()` here sends every report's prose down a route that exists to stop
 * sending it.
 */
export interface ReportStub {
  id: string
  label: string
  sentAt: Date | null
}



export type CaseWithCollections = CaseRow & Record<CaseCollection, unknown[]>

/**
 * A note without its Yjs document.
 *
 * **`select()` on a table with a bytea column sends the blob.** A note's
 * document is the same shape as a report's and there is one per note, so a
 * whole-row select puts every one of them in the case document -- and the
 * screen reads its words from `note`, which this keeps.
 */
const { document: _noteDocument, ...WIRED_NOTE } = getTableColumns(caseNotes)

const EMPTY_COLLECTIONS = Object.fromEntries(
  // `[] as unknown[]`, or `fromEntries` infers `never[]` and the assertion
  // below is rejected as an overlap that cannot happen.
  CASE_COLLECTIONS.map((name) => [name, [] as unknown[]]),
) as Record<CaseCollection, unknown[]>

@Injectable()
export class CasesService {
  /**
   * **The channel is optional for the tests, never for production.** Nest
   * always injects it; a DB-backed test would otherwise have to stand up a
   * socket channel for a broadcast nothing listens to. Same reasoning as
   * `CollectionService`, and the same trap if it is ever made required.
   */
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Optional() private readonly channel?: CaseChannel,
    @Optional() private readonly gateway?: LiveGateway,
  ) {}

  /** Every case the caller reaches, newest first: the store answers no other. */
  async list(): Promise<CaseRow[]> {
    return withReach(this.db, (tx) => tx.select().from(cases).orderBy(desc(cases.updatedAt)))
  }

  async get(id: string): Promise<CaseRow> {
    const [row] = await withReach(this.db, (tx) => tx.select().from(cases).where(eq(cases.id, id)))
    if (!row) throw new NotFoundException(`No case ${id}.`)
    return row
  }

  /**
   * What `CaseFrame` needs to draw the rail: a count per collection, the
   * attention numbers, and the reports list - without the rows behind them.
   *
   * Reads the timeline rows to tally the attention number and does not return
   * them, which is why the client cannot derive this. Counts come from
   * `count(*)` per table, so they stay index-only against `<table>_case_idx`.
   */
  async summary(id: string): Promise<CaseSummary> {
    const row = await this.get(id)

    const [counts, timelineRows, reportRows] = await withCase(this.db, id, async (tx) => {
      // `columnOf` rather than `table.caseId`: the counted tables are that many
      // distinct types and a union of them is unusable, so the column is
      // reached by name - which `columnOf` refuses at runtime if it is absent.
      const tally = async (table: PgTable): Promise<number> => {
        const [only] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(table)
          .where(eq(columnOf(table, 'caseId'), id))
        return only?.n ?? 0
      }
      // **Keyed, not positional.** Zipped against `CASE_COLLECTIONS` by index,
      // reordering that list relabels every count - the Assets chip drawing the
      // account tally - and no test sees it: swapping two entries leaves the
      // whole server suite green.
      //
      // **A loop rather than `.map` into `Promise.all`.** Every one of these
      // runs on the transaction's single connection, so firing them together
      // only queues them inside `pg` - with a deprecation that becomes an
      // error in `pg@9`. -> `db/in-series.ts`
      const counts: (readonly [CaseCollection, number])[] = []
      for (const [name, table] of Object.entries(COUNTED) as [CaseCollection, PgTable][]) {
        counts.push([name, await tally(table)] as const)
      }
      const [timelineRows, reportRows] = await inSeries(
        () => tx.select().from(timeline).where(eq(timeline.caseId, id)),
        () => tx
          .select({ id: reports.id, label: reports.label, sentAt: reports.sentAt })
          .from(reports)
          .where(eq(reports.caseId, id))
          .orderBy(asc(reports.createdAt)),
      )
      return [counts, timelineRows, reportRows] as const
    })

    const named = Object.fromEntries(counts) as Record<CaseCollection, number>

    return {
      ...row,
      counts: named,
      attention: timelineRows.some((entry) => isGapped(entry))
        ? { timeline: timelineRows.filter((entry) => isGapped(entry)).length }
        : {},
      reports: reportRows,
    }
  }

  /**
   * A case with its entity collections.
   *
   * **Every collection key is present and empty, never absent.** The workspace
   * shell reads `kase.<collection>.length` to draw the rail, so a missing key
   * is a crash on open rather than "no data" - which is what `EMPTY_COLLECTIONS`
   * is spread for.
   */
  async getWithCollections(id: string): Promise<CaseWithCollections> {
    const row = await this.get(id)

    // In series, because `withCase` pins these thirteen selects to one client.
    // -> `db/in-series.ts`
    const [
      timelineRows,
      systemRows,
      accountRows,
      indicatorRows,
      impactRows,
      malwareRows,
      cloudAppRows,
      evidenceRows,
      methodRows,
      actionRows,
      caseNoteRows,
      reportRows,
      reportBlockRows,
    ] = await withCase(this.db, id, (tx) => inSeries(
      () => tx.select().from(timeline).where(eq(timeline.caseId, id)).orderBy(asc(timeline.time)),
      () => tx.select().from(systems).where(eq(systems.caseId, id)),
      () => tx.select().from(accounts).where(eq(accounts.caseId, id)),
      () => tx.select().from(networkIndicators).where(eq(networkIndicators.caseId, id)),
      () => tx.select().from(impact).where(eq(impact.caseId, id)),
      () => tx.select().from(malware).where(eq(malware.caseId, id)),
      () => tx.select().from(cloudApps).where(eq(cloudApps.caseId, id)),
      () => tx.select().from(evidence).where(eq(evidence.caseId, id)),
      () => tx.select().from(methods).where(eq(methods.caseId, id)),
      () => tx.select().from(actions).where(eq(actions.caseId, id)),
      () => tx.select(WIRED_NOTE).from(caseNotes).where(eq(caseNotes.caseId, id)),
      () => tx.select().from(reports).where(eq(reports.caseId, id)),
      () => tx
        .select()
        .from(reportBlocks)
        .where(eq(reportBlocks.caseId, id))
        .orderBy(asc(reportBlocks.position)),
    ))

    return {
      ...row,
      ...EMPTY_COLLECTIONS,
      // Projected onto each row's own kind, exactly as the collection route
      // does - the case document and `GET .../timeline` must not describe a
      // timeline entry two different ways.
      // -> `domain/entities/timeline.ts`
      timeline: timelineRows.map((row) => timelineToWire(row as Record<string, unknown>)),
      systems: systemRows,
      accounts: accountRows,
      networkIndicators: indicatorRows,
      impact: impactRows,
      malware: malwareRows,
      cloudApps: cloudAppRows,
      evidence: evidenceRows,
      methods: methodRows,
      actions: actionRows,
      casenotes: caseNoteRows,
      reports: reportRows,
      /**
       * **Ordered by `position`, which the blocks alone need**: a report is a
       * document, so unordered sections are the wrong document rather than an
       * unsorted list.
       *
       * Carries no prose - a block row says what the section is and where it
       * sits, and its words live in the report's Yjs document.
       * -> `db/schema/report.ts`
       */
      reportBlocks: reportBlockRows,
    }
  }

  /**
   * Refuses a reference the customer is already using, naming the case.
   *
   * **The refusal is here and the guarantee is the index**, which is the split
   * the merge path does not need: `cases_customer_reference_idx` cannot be
   * bypassed, and this is what turns its violation into an answer an analyst
   * can act on rather than a failed query. A lookup alone would race two
   * simultaneous creates; the index alone would say only that something
   * collided.
   *
   * **Asked of the customer the case belongs to.** A case that carried no
   * customer and resolved to the default only when it was read leaves this
   * with one group to ask about -- and refusing a reference on that basis
   * refuses two genuinely different customers the same ticket number.
   */
  private async referenceIsFree(
    tx: Executor,
    customerId: string,
    reference?: string,
    /**
     * The case being written, where there is one.
     *
     * **Or an edit that leaves the reference alone refuses itself.** The
     * Overview form resends every field, so patching a summary asks whether
     * this case's own number is taken -- and it is, by this case.
     */
    except?: string,
  ): Promise<void> {
    // The absence of a reference is not a value and never collides, which is
    // also why the index is partial.
    if (!reference) return

    const [held] = await tx
      .select({ title: cases.title })
      .from(cases)
      .where(
        and(
          eq(cases.reference, reference),
          eq(cases.customerId, customerId),
          ...(except ? [ne(cases.id, except)] : []),
        ),
      )
      .limit(1)
    if (!held) return

    throw new ConflictException({
      message: `"${held.title}" already carries ${reference}. Give this case a different reference.`,
    })
  }

  /**
   * The customer a case is opened under.
   *
   * **Read on the handle passed in.** `create` may be one half of a larger
   * act, and a read reaching the pool from inside an open transaction holds
   * one connection while asking for another. -> `db/scope.ts`
   *
   * **The same question the boot hook asks**, so an install that has lost its
   * default gets one here rather than refusing to open a case -- and two
   * doors cannot disagree about which record it is.
   */
  private async openedUnder(tx: Executor): Promise<string> {
    return (await defaultCustomer(tx)).id
  }

  /**
   * Raise a case, optionally seeded from a template.
   *
   * The insert, its change-feed row and the seed are one transaction: a case
   * that exists and was never announced is invisible to every picker already
   * open, and one holding half a checklist looks started.
   */

  async create(
    /**
     * **What a case may be minted with.** `severity` and `detectedAt` are here
     * because a case created from an incident already knows them: the provider
     * reported the severity and the first activity, and a create that dropped
     * them leaves the analyst re-entering what the import has just read.
     */
    input: {
      title: string
      reference?: string | undefined
      customer?: string | undefined
      summary?: string | undefined
      severity?: (typeof SEVERITY)[number] | null | undefined
      detectedAt?: Date | null | undefined
    },
    actorId: string,
    seed?: CaseSeed,
    /** A caller's transaction, where the case is one half of a larger act. */
    on: Executor = this.db,
  ): Promise<CaseRow> {
    return withReach(on, async (tx) => {
      const customerId = await this.openedUnder(tx)
      await this.referenceIsFree(tx, customerId, input.reference)
      const [row] = await tx
        .insert(cases)
        .values({ ...input, customerId, createdBy: actorId, updatedBy: actorId })
        .returning()

      // Scoped here rather than by `withCase`: this transaction learns its
      // case from the insert. Without it the feed row below is refused.
      // -> `db/scope.ts`
      await tx.execute(sql`select set_config('app.case_id', ${row!.id}, true)`)

      await tx.insert(changeFeed).values({
        caseId: row!.id,
        entity: 'cases',
        entityId: row!.id,
        op: 'insert',
        version: row!.version,
        actorId,
        fields: Object.keys(input),
      })

      if (seed) await this.applySeed(tx, row!.id, seed, actorId)
      return row!
    })
  }

  /**
   * Write a template's checklist into the case that was just created.
   *
   * Writes actions, evidence and notes only - never a field on the case
   * itself, which would assert something about this incident that nobody has
   * observed. Call inside `create`'s transaction, whose `set_config` is what
   * lets these inserts pass row-level security.
   */
  private async applySeed(
    tx: Transaction,
    caseId: string,
    seed: CaseSeed,
    actorId: string,
  ): Promise<void> {
    const owned = { caseId, createdBy: actorId, updatedBy: actorId }

    if (seed.actions?.length) {
      await tx.insert(actions).values(
        seed.actions.map((one) => ({
          ...owned,
          task: one.task,
          ...(one.taskType ? { taskType: one.taskType } : {}),
        })),
      )
    }
    if (seed.evidence?.length) {
      await tx.insert(evidence).values(
        seed.evidence.map((one) => ({
          ...owned,
          name: one.name,
          ...(one.type ? { type: one.type } : {}),
        })),
      )
    }
    if (seed.notes?.length) {
      await tx.insert(caseNotes).values(
        seed.notes.map((one) => ({ ...owned, note: one.note })),
      )
    }
    if (seed.initialAccessVector) {
      await tx
        .update(cases)
        .set({ initialAccessVector: seed.initialAccessVector })
        .where(eq(cases.id, caseId))
    }
  }

  /**
   * Patch the case row under the version the caller read.
   *
   * **`cases` is the one table `updateVersioned` scopes by `id` alone**, since
   * it has no `caseId` column - it *is* the case. The cross-case protection
   * that clause provides for an entity row therefore does not exist here, and
   * nothing else needs to: `id` is already the narrowest possible scope.
   */
  async patch(
    id: string,
    expectedVersion: number,
    values: Record<string, unknown>,
    actorId: string,
  ): Promise<WriteResult<CaseRow>> {
    /**
     * **The door an analyst edits a reference through, so the door a
     * collision arrives at.** Without this the unique index refuses the write
     * and the driver's error reaches the analyst as a 500 naming nothing,
     * where every other writer names the case that holds the number.
     */
    const reference = values['reference']
    if (typeof reference === 'string') {
      await withReach(this.db, async (tx) => {
        const [row] = await tx
          .select({ customerId: cases.customerId })
          .from(cases)
          .where(eq(cases.id, id))
          .limit(1)
        if (row?.customerId) await this.referenceIsFree(tx, row.customerId, reference, id)
      })
    }

    const result = await updateVersioned<CaseRow>(this.db, {
      table: cases,
      entity: 'cases',
      caseId: id,
      id,
      expectedVersion,
      actorId,
      patch: values,
    })
    if (result.ok) this.channel?.announce(id, ['cases'], actorId)
    return result
  }

  /**
   * Delete the case and everything hanging off it, in one statement - every
   * `case_id` is declared `onDelete: 'cascade'`.
   *
   * Throws `ConflictException` naming the others present if anyone else is on
   * the case, and takes no version: `cases.version` moves on a case *field*
   * edit, so it is unmoved by an analyst who has spent an hour adding timeline
   * entries.
   *
   * Announces on the live channel, which is the only way an occupant hears:
   * `change_feed` cascades with the case, so a delete row would be removed by
   * the statement that wrote it. Drops the socket too, or a connection stays
   * open on a case that is gone.
   */
  async remove(id: string, actorId: string): Promise<void> {
    const others = (await this.channel?.othersOn(id, actorId)) ?? []
    if (others.length > 0) {
      throw new ConflictException({
        message: `${others.join(' and ')} still has this case open.`,
        present: others,
      })
    }

    const deleted = await withReach(this.db, (tx) =>
      tx.delete(cases).where(eq(cases.id, id)).returning({ id: cases.id }),
    )
    if (deleted.length === 0) throw new NotFoundException(`No case ${id}.`)
    this.channel?.announce(id, ['cases'], actorId)
    this.gateway?.dropCase(id)
  }

  /**
   * Give a case its customer, or move it to another one. Answers the customer
   * it left and the title, both of which the audit line needs.
   *
   * Raises `NotFoundException` for either record, and refuses a move to the
   * customer the case already answers for.
   *
   * **Writes nothing to the case's copy of the organisation's facts**, which
   * is deliberate and is what makes drift the analyst's decision rather than
   * this method's. **Takes no version**, for `remove`'s reason.
   *
   * **Ends every connection open on the case.** -> `openspec/specs/cases/design.md`
   *
   * **One transaction, as `merge` uses for the same rule.** The reference
   * boundary is a read followed by a write, and two moves racing each other
   * through separate connections is how the state it refuses gets created
   * anyway.
   */
  async attribute(
    id: string,
    customerId: string,
    actorId: string,
  ): Promise<{ from: string | null; title: string }> {
    const answer = await withReach(this.db, (tx) => this.moveWithin(tx, id, customerId))

    // Outside the transaction: neither is a database write, and announcing a
    // move that then rolled back would be worse than announcing it late.
    this.channel?.announce(id, ['cases'], actorId)
    this.gateway?.dropCase(id)
    return answer
  }

  private async moveWithin(
    tx: Transaction,
    id: string,
    customerId: string,
  ): Promise<{ from: string | null; title: string }> {
    const [held] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
    if (!held) throw new NotFoundException(`No customer ${customerId}.`)

    const [row] = await tx
      .select({ customerId: cases.customerId, title: cases.title, reference: cases.reference })
      .from(cases)
      .where(eq(cases.id, id))
    if (!row) throw new NotFoundException(`No case ${id}.`)
    if (row.customerId === customerId) {
      throw new UnprocessableEntityException({
        message: 'This case already answers for that customer.',
      })
    }

    // Finds a collision only where the mover reaches the destination: the
    // policies hide every other customer's cases, and the store refuses that
    // mover a referenced case before it looks.
    await this.referenceIsFree(tx, customerId, row.reference ?? undefined, id)

    const { rows } = await tx.execute<{ answer: 'moved' | 'absent' | 'default' | 'unreached' }>(
      sql`select ic_move_case(${id}::uuid, ${customerId}::uuid) as answer`,
    )
    switch (rows[0]?.answer) {
      case 'moved':
        return { from: row.customerId, title: row.title }
      case 'default':
        throw new ConflictException({
          message:
            'A case cannot be moved to the default customer. It stands for an incident ' +
            'whose origin is not yet known, and every analyst reaches it.',
        })
      case 'unreached':
        throw new ForbiddenException({
          message:
            'A case carrying a reference moves only to a customer you reach. ' +
            'Clear its reference to move it there.',
        })
      default:
        throw new NotFoundException(`No case ${id}.`)
    }
  }

}
