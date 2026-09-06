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
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import * as Y from 'yjs'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { LibraryService } from '../library/library.service.js'
import { REPORT_LAYOUTS } from '../library/kinds.js'
import type { LayoutBlock } from '../library/builtins/report-layouts.js'
import { ProseService, reportDocument } from '../prose/prose.service.js'
import { ReportRenderService } from './render.service.js'
import { documentSchema } from './document/model.js'
import { successorStage } from '../domain/report-lifecycle.js'
import { CaseChannel } from '../live/case-channel.service.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { withCase } from '../db/scope.js'
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
   * Stamp a report sent, and freeze the document it was at that moment.
   *
   * The document is resolved here and stored in the same statement as
   * `sent_at`: two writes leave a window in which a report is sent and frozen
   * to nothing.
   *
   * **`sent_at IS NULL` is the guard, not the version check.** Two analysts
   * pressing Send at once both hold the expected version, so only a conditional
   * update decides it.
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
  ): Promise<{ id: string; sentAt: string; sections: number }> {
    const report = await this.reportOr404(caseId, reportId)
    if (report.sentAt) {
      throw refusedBecauseSent(
        { id: report.id, label: report.label, sentAt: report.sentAt },
        're-sent',
      )
    }

    // **Resolved before the write, and outside it.** A section this build
    // cannot draw raises here, which leaves the report a draft - a report
    // stamped sent and frozen to a document that could not be produced is the
    // one state with no way back out.
    const { document_ } = await this.render.render(caseId, reportId, lang)
    const stamp = new Date()

    const updated = await withCase(this.db, caseId, (tx) =>
      tx
        .update(reports)
        .set({
          sentAt: stamp,
          // Validated on the way in, the same schema the render parses it back
          // through: the compliance artefact is gated at both boundaries.
          frozen: documentSchema.parse(document_),
          frozenAt: stamp,
          status: 'final',
          updatedBy: actorId,
          updatedAt: stamp,
          // **From the row, not from `report`.** That read happened before the
          // render, which is unbounded -- so arithmetic on it drives the
          // version *backwards* past anything the other analyst wrote while
          // the document was being drawn.
          version: sql`${reports.version} + 1`,
        })
        .where(
          and(
            eq(reports.id, reportId),
            eq(reports.caseId, caseId),
            // The race guard. Nothing else in this statement decides it.
            isNull(reports.sentAt),
          ),
        )
        .returning(),
    )

    if (updated.length === 0) {
      // **Re-read rather than assumed.** The conditional update returns nothing
      // for two reasons: another send won the race, or the row went. Telling an
      // analyst a report they can no longer
      // see "was sent by someone else" sends them after a successor a delete
      // never created, so `reportOr404` answers the second case honestly and
      // the winner's own stamp answers the first.
      const winner = await this.reportOr404(caseId, reportId)
      if (winner.sentAt) {
        throw refusedBecauseSent(
          { id: winner.id, label: winner.label, sentAt: winner.sentAt },
          're-sent',
        )
      }
      throw new ConflictException(
        `Report ${reportId} could not be sent: it changed while the send was ` +
          'being prepared.',
      )
    }

    // **Announced only when somebody did it.** The frame carries who wrote it
    // so another analyst's screen can attribute the change; a seed at boot has
    // no author and no one connected to tell.
    if (actorId) this.channel?.announce(caseId, ['reports'], actorId)
    return { id: reportId, sentAt: stamp.toISOString(), sections: document_.sections.length }
  }

  async missingSections(caseId: string, reportId: string): Promise<MissingSection[]> {
    const specs = await this.missingSpecs(caseId, reportId)
    return specs.map((spec) => ({
      kind: spec.kind,
      heading: spec.heading ?? spec.headingKey ?? '',
    }))
  }

  /**
   * The same determination, as the layout declared it.
   *
   * **`restoreSections` needs `headingKey` and the public shape drops it** -
   * a built-in section carries its identity there rather than in a literal, so
   * restoring from the flattened form would create a block the next call finds
   * missing all over again, and the operation would stop being idempotent.
   */
  private async missingSpecs(caseId: string, reportId: string): Promise<LayoutBlock[]> {
    const report = await this.reportOr404(caseId, reportId)

    // No layout, or the blank one: nothing is prescribed, so nothing is short.
    if (!report.template || report.template === BLANK_LAYOUT) return []

    const layout = await this.library.entry(REPORT_LAYOUTS, report.template)
    // **A deleted layout is not a broken report.** The analyst removed the file
    // this report started from; the document still stands, and answering with
    // a list of sections nobody can restore would be worse than saying nothing.
    if (!layout) return []

    const specs = ((layout.payload as { blocks?: LayoutBlock[] }).blocks ?? []).filter(
      (spec) => spec.required,
    )
    if (specs.length === 0) return []

    const blocks = await withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(reportBlocks)
        .where(and(eq(reportBlocks.caseId, caseId), eq(reportBlocks.reportId, reportId))),
    )
    const here = new Set(
      blocks.map((block) => identity(block.kind, block.heading ?? '', block.headingKey ?? '')),
    )

    return specs.filter(
      (spec) => !here.has(identity(spec.kind, spec.heading ?? '', spec.headingKey ?? '')),
    )
  }

  /**
   * Mint a successor carrying this report's layout, marking and sections.
   *
   * There is no unlock: the answer to a filed document being wrong is another
   * document, which is how Article 23 works already.
   *
   * The prose is cloned **by block**, each fragment re-keyed onto its successor
   * block. A superseded report is left exactly as it was, sent or not, and the
   * successor is a draft with no stamp of its own.
   */
  async supersede(
    caseId: string,
    reportId: string,
    actorId: string,
  ): Promise<{ id: string; superseded: string; blocks: number }> {
    const report = await this.reportOr404(caseId, reportId)

    const blocks = await withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(reportBlocks)
        .where(and(eq(reportBlocks.caseId, caseId), eq(reportBlocks.reportId, reportId)))
        .orderBy(asc(reportBlocks.position)),
    )

    const [fresh] = await withCase(this.db, caseId, (tx) =>
      tx
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
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning(),
    )
    if (!fresh) throw new ConflictException('The successor could not be created.')

    const copied =
      blocks.length === 0
        ? []
        : await withCase(this.db, caseId, (tx) =>
            tx
              .insert(reportBlocks)
              .values(
                blocks.map((block) => ({
                  caseId,
                  reportId: fresh.id,
                  position: block.position,
                  kind: block.kind,
                  heading: block.heading,
                  headingKey: block.headingKey,
                  createdBy: actorId,
                  updatedBy: actorId,
                })),
              )
              .returning(),
          )

    // Old block id -> the successor's block that took its place. The insert
    // above preserves order, so the two lists line up index for index.
    const rekey = new Map<string, string>()
    blocks.forEach((block, at) => {
      const twin = copied[at]
      if (twin) rekey.set(block.id, twin.id)
    })
    await this.cloneProse(caseId, reportId, fresh.id, rekey)

    this.channel?.announce(caseId, ['reports', 'report_blocks'], actorId)
    return { id: fresh.id, superseded: reportId, blocks: copied.length }
  }

  /**
   * Copy one report's written prose onto another's blocks.
   *
   * Read through `ProseService` rather than from the row, which may be older
   * than what the source's author is looking at; written straight to the
   * successor's row, since nobody can be holding a document for a report that
   * did not exist a moment ago.
   */
  private async cloneProse(
    caseId: string,
    fromReportId: string,
    toReportId: string,
    rekey: Map<string, string>,
  ): Promise<void> {
    if (rekey.size === 0) return

    const source = await this.prose.open(caseId, reportDocument(fromReportId))
    try {
      const target = new Y.Doc({ gc: false })
      let wrote = false
      for (const [oldId, newId] of rekey) {
        const fragment = source.getXmlFragment(oldId)
        if (fragment.length === 0) continue
        // **Cloned node by node.** `Y.encodeStateAsUpdate` would carry the
        // fragments under their own names, which is exactly the keying being
        // changed; there is no rename in the CRDT.
        const into = target.getXmlFragment(newId)
        into.insert(
          0,
          fragment.toArray().map((node) => node.clone()) as never,
        )
        wrote = true
      }
      if (!wrote) return

      const encoded = Buffer.from(Y.encodeStateAsUpdate(target))
      await withCase(this.db, caseId, (tx) =>
        tx
          .update(reports)
          .set({ document: encoded })
          .where(and(eq(reports.id, toReportId), eq(reports.caseId, caseId))),
      )
      target.destroy()
    } finally {
      await this.prose.release(caseId, reportDocument(fromReportId))
    }
  }

  /**
   * Add back the sections this report's layout marks required and it lost.
   *
   * Conformance repair rather than an undo: it restores a section the analyst
   * never had just the same. Idempotent, so a client can offer it without
   * tracking whether it has been pressed, and refused on a sent report - the
   * answer to a filed document being short is a successor.
   */
  async restoreSections(
    caseId: string,
    reportId: string,
    actorId: string,
  ): Promise<{ id: string; restored: MissingSection[] }> {
    const report = await this.reportOr404(caseId, reportId)
    if (report.sentAt) {
      throw refusedBecauseSent(
        { id: report.id, label: report.label, sentAt: report.sentAt },
        'repaired',
      )
    }

    const gone = await this.missingSpecs(caseId, reportId)
    if (gone.length === 0) return { id: reportId, restored: [] }

    // **Appended past the last block, not renumbered.** Gaps in `position` are
    // ordinary here and a restore that renumbered would reorder a document
    // somebody had arranged by hand.
    const [last] = await withCase(this.db, caseId, (tx) =>
      tx
        .select({ position: reportBlocks.position })
        .from(reportBlocks)
        .where(and(eq(reportBlocks.caseId, caseId), eq(reportBlocks.reportId, reportId)))
        .orderBy(desc(reportBlocks.position))
        .limit(1),
    )
    let next = (last?.position ?? -1) + 1

    await withCase(this.db, caseId, (tx) =>
      tx.insert(reportBlocks).values(
        gone.map((spec) => ({
          caseId,
          reportId,
          position: next++,
          kind: spec.kind,
          heading: spec.heading ?? '',
          headingKey: spec.headingKey ?? '',
          createdBy: actorId,
          updatedBy: actorId,
        })),
      ),
    )

    this.channel?.announce(caseId, ['report_blocks'], actorId)
    return {
      id: reportId,
      restored: gone.map((spec) => ({
        kind: spec.kind,
        heading: spec.heading ?? spec.headingKey ?? '',
      })),
    }
  }
}
