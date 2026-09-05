/**
 * What a sent report refuses, declared once for every door that writes one.
 *
 * Declared on the collection rather than at each door: three routes reach a
 * block's parent report three different ways, so a per-route guard is written
 * three times and goes stale on the fourth.
 *
 * **Reparenting is a write to the destination.** `reportBlockSchema` carries
 * `reportId`, so a PATCH can move a block *into* a sent report - the guard
 * reads the patch as well as the row, which is why `update` passes both.
 */
import { ConflictException } from '@nestjs/common'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import type { Database } from '../db/client.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { withCase } from '../db/scope.js'

/**
 * The rows a write is about to touch.
 *
 * **Both halves, because a write can name a report two ways.** `ids` are the
 * rows being changed or removed; `rows` are the values being written, which is
 * where a create - and a reparenting patch - names the report it lands in.
 */
export interface WriteTarget {
  readonly rows?: readonly Record<string, unknown>[]
  readonly ids?: readonly string[]
}

/** Throws if the write lands in a closed row; returns quietly otherwise. */
export type ClosedRowGuard = (
  db: Database,
  caseId: string,
  target: WriteTarget,
) => Promise<void>

/**
 * Refuse a write that lands in a report which has been sent.
 *
 * `'id'` is for the reports collection itself, where the ids being written are
 * report ids. `'reportId'` is for a collection whose rows belong to a report -
 * the ids are looked up to their parent, and a body naming a parent is read
 * directly.
 */
export function refuseWritesToSentReport(via: 'id' | 'reportId'): ClosedRowGuard {
  return async (db, caseId, target) => {
    const named = new Set<string>()
    const blockIds: string[] = []

    if (via === 'id') {
      for (const id of target.ids ?? []) named.add(id)
    } else {
      for (const row of target.rows ?? []) {
        const parent = row['reportId']
        if (typeof parent === 'string') named.add(parent)
      }
      blockIds.push(...(target.ids ?? []))
    }

    if (named.size === 0 && blockIds.length === 0) return

    const sent = await withCase(db, caseId, async (tx) => {
      if (blockIds.length > 0) {
        const parents = await tx
          .select({ reportId: reportBlocks.reportId })
          .from(reportBlocks)
          .where(and(inArray(reportBlocks.id, blockIds), eq(reportBlocks.caseId, caseId)))
        for (const row of parents) named.add(row.reportId)
      }
      if (named.size === 0) return undefined

      const [row] = await tx
        .select({ id: reports.id, label: reports.label, sentAt: reports.sentAt })
        .from(reports)
        .where(
          and(
            inArray(reports.id, [...named]),
            eq(reports.caseId, caseId),
            // **`sent_at`, matching `send`'s own race guard.** A report frozen
            // and not stamped is not a thing this codebase can produce, and
            // keying on `frozen` here would make the two halves disagree about
            // what "sent" means.
            isNotNull(reports.sentAt),
          ),
        )
        .limit(1)
      return row
    })

    if (!sent) return
    throw refusedBecauseSent(
      { id: sent.id, label: sent.label, sentAt: sent.sentAt! },
      'edited',
    )
  }
}

/**
 * The guard an entity's writes owe, or nothing where the entity is not part of
 * a report.
 *
 * Ask this from any write path that resolves an entity name, rather than
 * wiring a guard per caller: `CollectionService` is not the only one.
 */
export function freezeGuardFor(entity: string): ClosedRowGuard | undefined {
  if (entity === 'reports') return refuseWritesToSentReport('id')
  if (entity === 'report_blocks') return refuseWritesToSentReport('reportId')
  return undefined
}

/**
 * One body for every refusal of a filed report, so a client can read `sentAt`
 * off any of them. The verb still differs: a restore is a repair and a patch is
 * an edit, and telling an analyst the wrong one is worse than a uniform
 * sentence.
 */
export function refusedBecauseSent(
  report: { id: string; label?: string | null; sentAt: Date },
  verb: 'edited' | 'repaired' | 're-sent',
): ConflictException {
  return new ConflictException({
    message:
      `${report.label || 'That report'} was sent at ${report.sentAt.toISOString()}. ` +
      `A sent report is superseded, not ${verb}.`,
    reportId: report.id,
    sentAt: report.sentAt.toISOString(),
  })
}
