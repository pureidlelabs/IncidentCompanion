/**
 * Reading and writing which cases an analyst has been in.
 *
 * **Install-level and keyed on the analyst, so nothing here opens a case.**
 * The row-level policies scope by `app.case_id`; these rows span cases by
 * definition, and what keeps one analyst out of another's is the `userId`
 * predicate on every statement - stated because it is a different mechanism
 * from the one the rest of the server uses.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, isNull, notInArray, sql } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { caseVisits } from '../db/schema/case-visits.js'
import { cases } from '../db/schema/case.js'
import { z } from 'zod'

/**
 * How many unpinned cases an analyst is offered.
 *
 * **A ceiling on the read *and* on the table.** Keeping every visit forever
 * would grow a row per case per analyst that nothing ever reads again - and
 * "recent" past a dozen is a list nobody scans, so the rows below the line are
 * storage with no reader. Pinning is what an analyst uses to keep one.
 */
export const RECENT_LIMIT = 8

export const recentCaseSchema = z.object({
  caseId: z.uuid(),
  title: z.string(),
  reference: z.string().nullable(),
  customer: z.string().nullable(),
  status: z.enum(['open', 'closed']),
  section: z
    .string()
    .nullable()
    .describe('The rail section they were last in, or null if they never reached one.'),
  visitedAt: z.iso.datetime(),
  pinned: z.boolean(),
})

export type RecentCase = z.infer<typeof recentCaseSchema>

export const recentCasesSchema = z.object({
  pinned: z.array(recentCaseSchema),
  recent: z.array(recentCaseSchema),
})

export type RecentCases = z.infer<typeof recentCasesSchema>

@Injectable()
export class RecentService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * **One query, two lists.** Pinned and recent differ only by a predicate and
   * an order, and splitting them into two round trips would let the two halves
   * disagree about a case pinned between them - it would appear in both, or in
   * neither.
   */
  async list(userId: string): Promise<RecentCases> {
    const rows = await this.db
      .select({
        caseId: caseVisits.caseId,
        section: caseVisits.section,
        visitedAt: caseVisits.visitedAt,
        pinnedAt: caseVisits.pinnedAt,
        title: cases.title,
        reference: cases.reference,
        customer: cases.customer,
        status: cases.status,
      })
      .from(caseVisits)
      .innerJoin(cases, eq(cases.id, caseVisits.caseId))
      .where(eq(caseVisits.userId, userId))
      .orderBy(desc(caseVisits.pinnedAt), desc(caseVisits.visitedAt), desc(caseVisits.caseId))

    const view = (row: (typeof rows)[number]): RecentCase => ({
      caseId: row.caseId,
      title: row.title,
      reference: row.reference,
      customer: row.customer,
      status: row.status,
      section: row.section,
      visitedAt: row.visitedAt.toISOString(),
      pinned: row.pinnedAt !== null,
    })

    return {
      pinned: rows.filter((r) => r.pinnedAt !== null).map(view),
      // Already ordered by `visitedAt` within the unpinned half, and capped
      // here as well as at the prune: a row can outlive a prune by being
      // written concurrently, and a list that is one too long is a defect the
      // reader would see.
      recent: rows
        .filter((r) => r.pinnedAt === null)
        .slice(0, RECENT_LIMIT)
        .map(view),
    }
  }

  /**
   * Record that this analyst is in this case, in this section.
   *
   * **The upsert names the two columns a visit owns and no others**, so a pin
   * survives being visited. Overwriting the row is the obvious spelling and it
   * silently unpins, which looks correct until somebody opens a pinned case.
   */
  async visit(userId: string, caseId: string, section: string | null): Promise<void> {
    // `clock_timestamp()`, because `new Date()` is whole milliseconds and ties
    // - and the prune below reads the same order, so a tie drops the wrong
    // row. `now()` is constant inside a transaction and ties by construction.
    const visitedAt = sql`clock_timestamp()`
    await this.db
      .insert(caseVisits)
      .values({ userId, caseId, section, visitedAt })
      .onConflictDoUpdate({
        target: [caseVisits.userId, caseVisits.caseId],
        set: { section, visitedAt },
      })
    await this.prune(userId)
  }

  /**
   * **`pinnedAt` is written from the server's clock, never the caller's.** The
   * pinned list is ordered by it, so a client with a skewed clock would sort
   * its own pin to the top or bottom of everyone's.
   */
  async pin(userId: string, caseId: string, pinned: boolean): Promise<void> {
    const pinnedAt = pinned ? new Date() : null
    await this.db
      .insert(caseVisits)
      .values({ userId, caseId, section: null, pinnedAt })
      .onConflictDoUpdate({
        target: [caseVisits.userId, caseVisits.caseId],
        set: { pinnedAt },
      })
    // Unpinning puts a row back under the ceiling, and it may be the oldest.
    if (!pinned) await this.prune(userId)
  }

  /** Forget one case. The case itself is untouched - this is the analyst's list. */
  async forget(userId: string, caseId: string): Promise<void> {
    await this.db
      .delete(caseVisits)
      .where(and(eq(caseVisits.userId, userId), eq(caseVisits.caseId, caseId)))
  }

  /**
   * Drop this analyst's unpinned tail.
   *
   * **Scoped to the one analyst, and pinned rows are never candidates.** A
   * prune written as "delete the oldest rows in the table" evicts whoever has
   * been away longest rather than whoever has the longest list, and both
   * mistakes are invisible in a single-analyst test.
   */
  private async prune(userId: string): Promise<void> {
    const keep = await this.db
      .select({ caseId: caseVisits.caseId })
      .from(caseVisits)
      .where(and(eq(caseVisits.userId, userId), isNull(caseVisits.pinnedAt)))
      /**
       * **The tiebreaker is not decoration.** `clock_timestamp()` makes a tie
       * vanishingly unlikely rather than impossible, and a tie here decides
       * which row is *deleted* -- so without a second key the same input can
       * prune differently on two runs.
       */
      .orderBy(desc(caseVisits.visitedAt), desc(caseVisits.caseId))
      .limit(RECENT_LIMIT)

    await this.db.delete(caseVisits).where(
      and(
        eq(caseVisits.userId, userId),
        isNull(caseVisits.pinnedAt),
        keep.length
          ? notInArray(
              caseVisits.caseId,
              keep.map((row) => row.caseId),
            )
          : sql`true`,
      ),
    )
  }
}
