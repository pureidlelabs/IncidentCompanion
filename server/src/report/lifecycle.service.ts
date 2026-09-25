/**
 * What a report's layout requires and it no longer holds.
 *
 * The server answers this rather than a client deriving it: matching a layout's
 * required list against a report's blocks needs the identity rule below, and
 * two clients deriving it are two chances to disagree about whether a document
 * is short.
 */
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { LibraryService } from '../library/library.service.js'
import { REPORT_LAYOUTS } from '../library/kinds.js'
import type { LayoutBlock } from '../library/builtins/report-layouts.js'
import { ProseService, reportDocument } from '../prose/prose.service.js'
import { ReportRenderService, type Rendered } from './render.service.js'
import { documentSchema } from './document/model.js'
import { successorStage } from '../domain/report-lifecycle.js'
import { rekeyed } from '../domain/prose-fields.js'
import { CaseChannel } from '../live/case-channel.service.js'
import { changeFeed } from '../db/schema/change-feed.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { withCase, type Executor } from '../db/scope.js'
import { BLANK_LAYOUT, WRITTEN_BLOCK } from './block-kinds.js'
import { refusedBecauseSent } from './freeze.js'

export interface MissingSection {
  kind: string
  heading: string
}

/**
 * What tells two required sections apart: a generated block is its kind alone,
 * and a written one is its heading - or its `headingKey` where it has one.
 */
function identity(kind: string, heading: string, headingKey = ''): string {
  // **The separator is a NUL, written as an escape and never typed.** A
  // heading is analyst text and may hold any printable character, so the
  // join needs one that cannot occur in it. A literal NUL in the source is
  // refused by tests/repo/test_source_hygiene.py: a corrupted space and a
  // deliberate separator are indistinguishable to a sweep.
  const key = kind === WRITTEN_BLOCK ? heading || headingKey : ''
  return kind + '\u0000' + key
}

/** The required sections `blocks` does not hold. */
function missing(
  required: readonly LayoutBlock[],
  blocks: readonly { kind: string; heading: string; headingKey: string }[],
): LayoutBlock[] {
  const here = new Set(blocks.map((block) => identity(block.kind, block.heading, block.headingKey)))
  return required.filter((spec) => !here.has(identity(spec.kind, spec.heading ?? '', spec.headingKey ?? '')))
}

/** The report's id where it moved since `basis` was drawn, then each part added, removed or changed since. */
function movedSince(
  basis: Rendered['basis'],
  version: number,
  reportId: string,
  parts: readonly { id: string; version: number }[],
): string[] {
  if (!basis) return [reportId]
  const drawn = new Map(basis.parts.map((part) => [part.id, part.version]))
  const now = new Set(parts.map((part) => part.id))
  return [
    ...(basis.version === version ? [] : [reportId]),
    ...parts.filter((part) => drawn.get(part.id) !== part.version).map((part) => part.id),
    ...basis.parts.filter((part) => !now.has(part.id)).map((part) => part.id),
  ]
}

/** The feed row an inserted report or part owes. */
function inserted(
  entity: 'reports' | 'report_blocks',
  row: { id: string; version: number; caseId: string },
  actorId: string,
): typeof changeFeed.$inferInsert {
  return { caseId: row.caseId, entity, entityId: row.id, op: 'insert', version: row.version, actorId, fields: [] }
}

@Injectable()
export class ReportLifecycleService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly library: LibraryService,
    private readonly render: ReportRenderService,
    private readonly prose: ProseService,
    @Optional() private readonly channel?: CaseChannel,
  ) {}

  private async reportOr404(caseId: string, reportId: string) {
    const [report] = await withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(reports)
        .where(and(eq(reports.id, reportId), eq(reports.caseId, caseId))),
    )
    if (!report) throw new NotFoundException(`No report ${reportId} in this case.`)
    return report
  }

  /**
   * Stamp a report sent, with the document it was rendered from and its prose.
   *
   * One act: the stamp, the frozen tree, the prose and the feed row commit
   * together, under a lock on the report, and only where no part the render
   * drew from has moved since. Prose is held still from before the render
   * until the act settles. -> `openspec/specs/report/design.md`
   *
   * Throws 409 where the report was already sent, or where the report or a
   * part of it changed while the document was being drawn, naming what moved.
   */
  async send(
    caseId: string,
    reportId: string,
    /**
     * **Nullable, because a demo's report has no analyst.** The column is a
     * `set null` reference for the same reason - work outlives the account that
     * did it - so an unattributed write is a state the schema already allows,
     * and inventing a `demo-seeder` id to satisfy it violates the key.
     */
    actorId: string | null,
    lang?: string,
    /** When it was sent, for a demo declaring a moment in its past. */
    at = new Date(),
  ): Promise<{ id: string; sentAt: string; sections: number }> {
    const report = await this.reportOr404(caseId, reportId)
    if (report.sentAt) throw refusedBecauseSent({ ...report, sentAt: report.sentAt }, 're-sent')

    const seal = await this.prose.seal(caseId, reportId)
    let stamped: Date | null = null
    try {
      // **Resolved before the write, and outside it.** A section this build
      // cannot draw raises here, which leaves the report a draft. The render
      // is unbounded, so no lock is held across it.
      const { document_, basis } = await this.render.render(caseId, reportId, lang)
      const frozen = documentSchema.parse(document_)

      await withCase(this.db, caseId, async (tx) => {
        const [row] = await tx
          .select()
          .from(reports)
          .where(and(eq(reports.id, reportId), eq(reports.caseId, caseId)))
          .for('update')
        if (!row) throw new NotFoundException(`No report ${reportId} in this case.`)
        if (row.sentAt) throw refusedBecauseSent({ ...row, sentAt: row.sentAt }, 're-sent')

        const parts = await tx
          .select({ id: reportBlocks.id, version: reportBlocks.version })
          .from(reportBlocks)
          .where(and(eq(reportBlocks.caseId, caseId), eq(reportBlocks.reportId, reportId)))
        const moved = movedSince(basis, row.version, reportId, parts)
        if (moved.length > 0) {
          throw new ConflictException({
            message:
              `${row.label || 'That report'} changed while the send was being prepared, ` +
              'so it was not sent.',
            moved,
          })
        }

        await tx
          .update(reports)
          .set({
            sentAt: at,
            // Validated on the way in, the same schema the render parses it back
            // through: the compliance artefact is gated at both boundaries.
            frozen,
            frozenAt: at,
            status: 'final',
            document: Buffer.from(seal.bytes),
            updatedBy: actorId,
            updatedAt: at,
            version: row.version + 1,
          })
          .where(eq(reports.id, reportId))
        await tx.insert(changeFeed).values({
          caseId,
          entity: 'reports',
          entityId: reportId,
          op: 'update',
          version: row.version + 1,
          actorId,
          fields: ['sentAt', 'frozen', 'frozenAt', 'status', 'document'],
        })
      })
      stamped = at

      // **Announced only when somebody did it.** A seed at boot has no author
      // and no one connected to tell.
      if (actorId) this.channel?.announce(caseId, ['reports'])
      return { id: reportId, sentAt: at.toISOString(), sections: document_.sections.length }
    } finally {
      await seal.settle(stamped)
    }
  }

  async missingSections(caseId: string, reportId: string): Promise<MissingSection[]> {
    const report = await this.reportOr404(caseId, reportId)
    const required = await this.requiredBy(report.template)
    if (required.length === 0) return []
    const blocks = await withCase(this.db, caseId, (tx) => this.partsOf(tx, caseId, reportId))
    return missing(required, blocks).map((spec) => ({
      kind: spec.kind,
      heading: spec.heading ?? spec.headingKey ?? '',
    }))
  }

  /**
   * The sections a layout marks required, as it declared them.
   *
   * **`restoreSections` needs `headingKey` and the public shape drops it** -
   * a built-in section carries its identity there rather than in a literal, so
   * restoring from the flattened form would create a block the next call finds
   * missing all over again, and the operation would stop being idempotent.
   */
  private async requiredBy(template: string): Promise<LayoutBlock[]> {
    // No layout, or the blank one: nothing is prescribed, so nothing is short.
    if (!template || template === BLANK_LAYOUT) return []

    const layout = await this.library.entry(REPORT_LAYOUTS, template)
    // **A deleted layout is not a broken report.** The analyst removed the file
    // this report started from; the document still stands, and answering with
    // a list of sections nobody can restore would be worse than saying nothing.
    if (!layout) return []

    return ((layout.payload as { blocks?: LayoutBlock[] }).blocks ?? []).filter((spec) => spec.required)
  }

  private partsOf(tx: Executor, caseId: string, reportId: string) {
    return tx
      .select()
      .from(reportBlocks)
      .where(and(eq(reportBlocks.caseId, caseId), eq(reportBlocks.reportId, reportId)))
      .orderBy(asc(reportBlocks.position))
  }

  /**
   * Mint a successor carrying this report's layout, marking, sections and prose.
   *
   * There is no unlock: the answer to a filed document being wrong is another
   * document, which is how Article 23 works already.
   *
   * One act: the successor, its parts, their feed rows and its prose commit
   * together or not at all. The prose is cloned **by block**, each fragment
   * re-keyed onto its successor block; for a sent report it is what was sent.
   * A superseded report is left exactly as it was, and the successor is a
   * draft with no stamp of its own.
   *
   * Throws 409 where the report was already superseded.
   */
  async supersede(
    caseId: string,
    reportId: string,
    actorId: string,
  ): Promise<{ id: string; superseded: string; blocks: number }> {
    const source = await this.prose.open(caseId, reportDocument(reportId))
    try {
      const made = await withCase(this.db, caseId, async (tx) => {
        const [report] = await tx
          .select()
          .from(reports)
          .where(and(eq(reports.id, reportId), eq(reports.caseId, caseId)))
          .for('share')
        if (!report) throw new NotFoundException(`No report ${reportId} in this case.`)

        /**
         * **Asked before the work, and settled by the index after it.** A report
         * already corrected is refused here so the caller reads a sentence rather
         * than a constraint; two calls that both pass this check are two inserts
         * naming one predecessor, and `reports_supersedes_idx` refuses the second.
         * -> #182
         */
        const [already] = await tx
          .select({ id: reports.id })
          .from(reports)
          .where(and(eq(reports.caseId, caseId), eq(reports.supersedes, reportId)))
          .limit(1)
        if (already) throw new ConflictException('That report has already been superseded.')

        const blocks = await this.partsOf(tx, caseId, reportId)
        const [fresh] = await tx
          .insert(reports)
          .values({
            caseId,
            label: `${report.label} (revised)`.trim(),
            template: report.template,
            stage: successorStage(report.stage),
            tlp: report.tlp,
            language: report.language,
            style: report.style,
            // **A draft, whatever the original was.** A successor minted `final`
            // would be a document nobody wrote presented as one somebody signed.
            status: 'draft',
            supersedes: reportId,
            createdBy: actorId,
            updatedBy: actorId,
          })
          .returning()
        const copied =
          blocks.length === 0
            ? []
            : await tx
                .insert(reportBlocks)
                .values(
                  blocks.map((block) => ({
                    caseId,
                    reportId: fresh!.id,
                    position: block.position,
                    kind: block.kind,
                    heading: block.heading,
                    headingKey: block.headingKey,
                    createdBy: actorId,
                    updatedBy: actorId,
                  })),
                )
                .returning()
        await tx.insert(changeFeed).values([
          inserted('reports', fresh!, actorId),
          ...copied.map((block) => inserted('report_blocks', block, actorId)),
        ])

        // Old block id -> the successor's block that took its place. The insert
        // above preserves order, so the two lists line up index for index.
        // Written sections only: a correction starts from the report as it reads.
        const rekey = new Map(
          blocks.flatMap((block, at) =>
            copied[at] && block.kind === WRITTEN_BLOCK ? [[block.id, copied[at].id] as const] : [],
          ),
        )
        const encoded = rekey.size > 0 ? rekeyed(source, rekey) : null
        if (encoded) {
          await tx.update(reports).set({ document: Buffer.from(encoded) }).where(eq(reports.id, fresh!.id))
        }
        return { id: fresh!.id, blocks: copied.length }
      })

      this.channel?.announce(caseId, ['reports', 'report_blocks'])
      return { id: made.id, superseded: reportId, blocks: made.blocks }
    } finally {
      await this.prose.release(caseId, reportDocument(reportId))
    }
  }

  /**
   * Add back the sections this report's layout marks required and it lost.
   *
   * Conformance repair rather than an undo: it restores a section the analyst
   * never had just the same. Idempotent, so a client can offer it without
   * tracking whether it has been pressed: one act under a lock on the report,
   * so a second restore fired at the same moment restores nothing. Refused on
   * a sent report - the answer to a filed document being short is a successor.
   */
  async restoreSections(
    caseId: string,
    reportId: string,
    actorId: string,
  ): Promise<{ id: string; restored: MissingSection[] }> {
    const report = await this.reportOr404(caseId, reportId)
    const required = await this.requiredBy(report.template)

    const gone = await withCase(this.db, caseId, async (tx) => {
      const [locked] = await tx
        .select()
        .from(reports)
        .where(and(eq(reports.id, reportId), eq(reports.caseId, caseId)))
        .for('update')
      if (!locked) throw new NotFoundException(`No report ${reportId} in this case.`)
      if (locked.sentAt) throw refusedBecauseSent({ ...locked, sentAt: locked.sentAt }, 'repaired')
      if (locked.template !== report.template) {
        throw new ConflictException('The report changed its layout while its sections were being restored.')
      }

      const blocks = await this.partsOf(tx, caseId, reportId)
      const wanted = missing(required, blocks)
      if (wanted.length === 0) return []

      // **Appended past the last block, not renumbered.** Gaps in `position` are
      // ordinary here and a restore that renumbered would reorder a document
      // somebody had arranged by hand.
      let next = (blocks.at(-1)?.position ?? -1) + 1
      const made = await tx
        .insert(reportBlocks)
        .values(
          wanted.map((spec) => ({
            caseId,
            reportId,
            position: next++,
            kind: spec.kind,
            heading: spec.heading ?? '',
            headingKey: spec.headingKey ?? '',
            createdBy: actorId,
            updatedBy: actorId,
          })),
        )
        .returning()
      await tx.insert(changeFeed).values(made.map((block) => inserted('report_blocks', block, actorId)))
      return wanted
    })

    if (gone.length > 0) this.channel?.announce(caseId, ['report_blocks'])
    return {
      id: reportId,
      restored: gone.map((spec) => ({ kind: spec.kind, heading: spec.heading ?? spec.headingKey ?? '' })),
    }
  }
}
