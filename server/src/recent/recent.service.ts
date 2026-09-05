/**
 * Reading and writing which cases an analyst has been in.
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
   * **One query, two lists.**
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
   * **`pinnedAt` is written from the server's clock, never the caller's.**
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
   */
  private async prune(userId: string): Promise<void> {
    const keep = await this.db
      .select({ caseId: caseVisits.caseId })
      .from(caseVisits)
      .where(and(eq(caseVisits.userId, userId), isNull(caseVisits.pinnedAt)))
      /**
       * **The tiebreaker is not decoration.**
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
