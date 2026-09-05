/**
 * What two analysts disagreed about, field by field.
 */
import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'

import { isScope } from '../domain/scopes.lists.js'
import { REVIEWABLE } from './registry.js'
import { columnOf } from '../db/column-access.js'
import { withCase } from '../db/scope.js'
import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { updateVersioned } from '../db/mutate.js'
import { conflicts } from '../db/schema/index.js'
import { CaseChannel } from '../live/case-channel.service.js'
import { freezeGuardFor } from '../report/freeze.js'
import { z } from 'zod'

/** One field, three ways. Values are rendered, because the review is read by a person. */
export const fieldConflictSchema = z.object({
  field: z.string(),
  base: z.string().describe('The value the refused save was written against.'),
  mine: z.string().describe('What this analyst tried to write.'),
  theirs: z.string().describe('What is stored now, written by somebody else.'),
})

export type FieldConflict = z.infer<typeof fieldConflictSchema>

export const rowReviewSchema = z.object({
  table: z.string(),
  entryId: z.string(),
  label: z.string().describe('The row as an analyst would name it.'),
  fields: z.array(fieldConflictSchema),
  deletedByThem: z
    .boolean()
    .describe('The row is gone, so there is nothing left to merge into.'),
})

export type RowReview = z.infer<typeof rowReviewSchema>

export interface RefusedSave {
  readonly caseId: string
  readonly userId: string
  readonly entity: string
  readonly entityId: string
  /** What the edit was made against. Empty when the client sent none. */
  readonly base: Record<string, unknown>
  readonly mine: Record<string, unknown>
}

/**
 * The first field that reads like a name.
 */
const LABEL_FIELDS = [
  'hostname',
  'accountName',
  'description',
  'name',
  'value',
  'filename',
  'indicator',
  'heading',
  'title',
  // **A report is named by `label`.** Without it none of the fields above is
  // one a report has, so a merge review on one fell back to the row id and
  // greeted the analyst with a UUID over the report it was about.
  'label',
] as const

@Injectable()
export class ConflictsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Optional() private readonly channel?: CaseChannel,
  ) {}

  /**
   * A field as the review shows it.
   */
  static rendered(value: unknown): string {
    if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
    if (typeof value === 'boolean') return value ? 'yes' : 'no'
    if (value === null || value === undefined) return ''
    if (value instanceof Date) return value.toISOString()
    // **A merge review shows what the other analyst wrote**, and a jsonb
    // field arriving here as an object rendered as '[object Object]' --
    // which reads as a value and tells the reader nothing about the
    // conflict they are being asked to resolve.
    if (typeof value === 'object') return JSON.stringify(value)
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'bigint') return String(value)
    // Whatever is left is a function or a symbol, and neither is a field
    // value: rendering one puts source text or `Symbol()` in front of an
    // analyst who is being asked which version to keep.
    return ''
  }

  /**
   * The row a held review is about, or undefined once it is gone.
   */
  private async rowById(
    entity: string,
    entityId: string,
    caseId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const table = REVIEWABLE[entity]
    if (!table) return undefined
    const [row] = (await withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(table)
        .where(
        and(eq(columnOf(table, 'id'), entityId), eq(columnOf(table, 'caseId'), caseId)),
      ),
    )) as Record<string, unknown>[]
    return row
  }

  private static labelOf(row: Record<string, unknown> | undefined, fallback: string): string {
    for (const name of LABEL_FIELDS) {
      const text = row?.[name]
      if (typeof text === 'string' && text.trim()) return text.trim()
    }
    return fallback
  }

  /**
   * Keep a refused save until its analyst answers it.
   */
  async record(refused: RefusedSave): Promise<void> {
    const { caseId, userId, entity, entityId, base, mine } = refused
    const row = await this.rowById(entity, entityId, caseId)

    await withCase(this.db, caseId, (tx) =>
      tx
        .insert(conflicts)
        .values({
          caseId,
          userId,
          entity,
          entityId,
          label: ConflictsService.labelOf(row, entityId),
          base,
          mine,
        })
        .onConflictDoUpdate({
          target: [conflicts.caseId, conflicts.userId, conflicts.entity, conflicts.entityId],
          set: { base, mine, createdAt: new Date() },
        }),
    )
  }

  /**
   * The reviews this analyst still owes an answer.
   */
  async pending(caseId: string, userId: string): Promise<RowReview[]> {
    const held = await withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(conflicts)
        .where(and(eq(conflicts.caseId, caseId), eq(conflicts.userId, userId))),
    )

    const reviews: RowReview[] = []
    const settled: string[] = []

    for (const entry of held) {
      const row = await this.rowById(entry.entity, entry.entityId, caseId)

      if (!row) {
        reviews.push({
          table: entry.entity,
          entryId: entry.entityId,
          label: entry.label,
          fields: [],
          deletedByThem: true,
        })
        continue
      }

      const fields: FieldConflict[] = []
      for (const [field, mine] of Object.entries(entry.mine)) {
        const base = ConflictsService.rendered(entry.base[field])
        const theirs = ConflictsService.rendered(row[field])
        const ours = ConflictsService.rendered(mine)
        // Both moved it, and to different answers. Either half missing is a
        // merge rather than a question.
        if (theirs !== base && ours !== base && ours !== theirs) {
          fields.push({ field, base, mine: ours, theirs })
        }
      }

      if (fields.length === 0) {
        settled.push(entry.id)
        continue
      }
      reviews.push({
        table: entry.entity,
        entryId: entry.entityId,
        label: entry.label,
        fields,
        deletedByThem: false,
      })
    }

    for (const id of settled) {
      await withCase(this.db, caseId, (tx) =>
        tx.delete(conflicts).where(eq(conflicts.id, id)),
      )
    }
    return reviews
  }

  /**
   * Answer every review this analyst holds on the case.
   */
  async resolve(
    caseId: string,
    userId: string,
    choice: 'mine' | 'theirs',
  ): Promise<{ settled: number }> {
    const held = await withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(conflicts)
        .where(and(eq(conflicts.caseId, caseId), eq(conflicts.userId, userId))),
    )
    if (held.length === 0) return { settled: 0 }

    const touched = new Set<string>()
    if (choice === 'mine') {
      for (const entry of held) {
        // **`REVIEWABLE`, the same list `rowById` reads.** Resolving through
        // the bulk-delete targets skipped every report and report block -- and
        // the record below is deleted either way, so "keep mine" on a report
        // closed the review, answered `settled`, and wrote nothing. The
        // analyst is told their choice was applied and cannot see that it was
        // not.
        const table = REVIEWABLE[entry.entity]
        if (!table) continue
        const row = await this.rowById(entry.entity, entry.entityId, caseId)
        // Deleted by them and answered "keep mine": there is no row to write
        // to. Putting it back is a different feature from resolving a field
        // disagreement, so the record is dropped and the row stays gone.
        if (!row) continue

        // A write path outside `CollectionService`, so the freeze is asked for
        // here rather than inherited. -> `report/freeze.ts`
        await freezeGuardFor(entry.entity)?.(this.db, caseId, {
          ids: [entry.entityId],
          rows: [entry.mine],
        })

        const written = await updateVersioned(this.db, {
          table,
          entity: entry.entity,
          caseId,
          id: entry.entityId,
          expectedVersion: row['version'] as number,
          actorId: userId,
          patch: entry.mine,
        })

        // Thrown rather than ignored: the delete below is unconditional, so a
        // discarded refusal drops the analyst's values and still answers
        // `settled`.
        if (!written.ok) {
          throw new ConflictException({
            message:
              'Somebody wrote that row while this review was open. ' +
              'Your values are still here - open the review again.',
            entity: entry.entity,
            entityId: entry.entityId,
            currentVersion: written.currentVersion,
          })
        }

        touched.add(entry.entity)
      }
    }

    await withCase(this.db, caseId, (tx) =>
      tx
        .delete(conflicts)
        .where(and(eq(conflicts.caseId, caseId), eq(conflicts.userId, userId))),
    )

    // **Filtered, not cast.** `entity` is a column, so it is whatever was
    // written to it; a value the union does not have would otherwise become a
    // query key no screen reads, and the settle would look like it worked.
    const scopes = [...touched].filter(isScope)
    if (scopes.length > 0) this.channel?.announce(caseId, scopes, userId)
    return { settled: held.length }
  }
}
