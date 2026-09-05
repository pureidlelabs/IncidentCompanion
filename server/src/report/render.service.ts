/**
 * The one place a report becomes a document, for every caller that needs one -
 * `send` and the three export routes alike, so a frozen artefact and the file
 * the analyst previewed cannot differ.
 */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { CasesService } from '../cases/cases.service.js'
import { ProseService, reportDocument } from '../prose/prose.service.js'
import { LanguageService } from './language.service.js'
import { UnresolvableSections, resolveReport } from './document/resolve.js'
import { defangDocument } from './document/defang.js'
import { reportBlocks, reports } from '../db/schema/report.js'
import { withCase } from '../db/scope.js'
import type { CaseData } from './document/sections.js'
import { documentSchema, type Document, type FigureNode, type Images } from './document/model.js'
import type { Translate } from './document/packs.js'
import { CONTENT_PT } from './document/pdf.js'
import { EvidenceStore } from '../evidence/store.js'

export interface Rendered {
  document_: Document
  title: string
  /** Whether this came from the frozen tree rather than from the case now. */
  frozen: boolean
  /**
   * The bytes for every figure this install still holds, keyed on digest.
   */
  images: Images
}

/**
 * The widest and tallest a placed figure may be, in points.
 */
const FIGURE_MAX_W = CONTENT_PT
const FIGURE_MAX_H = 420

@Injectable()
export class ReportRenderService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly cases: CasesService,
    private readonly prose: ProseService,
    private readonly languages: LanguageService,
    private readonly evidence: EvidenceStore,
  ) {}

  /**
   * Load every figure's artefact, place it, and answer the bytes each painter
   * will embed.
   */
  private async figures(document_: Document, t: Translate | null): Promise<Images> {
    const nodes = document_.sections.flatMap((one) =>
      one.nodes.filter((node_): node_ is FigureNode => node_.type === 'figure'),
    )
    const images = new Map<string, Uint8Array>()

    await Promise.all(
      nodes.map(async (node_) => {
        if (!node_.hash) return
        // **A read failure is a missing image, not a failed export.** The store
        // is content-addressed and an artefact can be absent from this install
        // entirely; the block still draws its caption.
        const bytes = await this.evidence.read(node_.hash).catch(() => null)
        if (!bytes) {
          if (t) node_.note = t('figure.unavailable')
          return
        }
        try {
          const { default: sharp } = await import('sharp')
          const meta = await sharp(bytes).metadata()
          const wPx = meta.width ?? 0
          const hPx = meta.height ?? 0
          if (wPx <= 0 || hPx <= 0) throw new Error('the artefact declares no dimensions')

          // Every painter embeds PNG, whatever the analyst attached.
          const drawable = await sharp(bytes).png().toBuffer()
          images.set(node_.hash, drawable)

          // Normalising happens on both paths; measuring only on this one.
          if (!t) return

          // Pixels are 96 to the inch and a point is 72, then scaled down to
          // whichever cap binds first. Never scaled *up*: a 200px screenshot
          // blown across the column is worse than a small sharp one.
          const scale = Math.min(FIGURE_MAX_W / (wPx * 0.75), FIGURE_MAX_H / (hPx * 0.75), 1)
          node_.widthPt = Math.round(wPx * 0.75 * scale)
          node_.heightPt = Math.round(hPx * 0.75 * scale)
          delete node_.note
        } catch {
          // Held, but not an image this build can draw - a `.pdf`, or anything
          // sharp cannot decode. Not `.tiff`: sharp reads that perfectly well
          // and it takes the branch above, which is what makes normalising
          // there the thing that matters rather than this arm.
          //
          // **A truncated PNG lands here too, and only because the re-encode is
          // inside this `try`**: `metadata()` reads the header and reports a
          // size happily, and `.png()` is what discovers there are no pixels
          // behind it. Measured; before the re-encode moved in, such an
          // artefact reached the painter with a size and no image.
          images.delete(node_.hash)
          // A frozen render has no translator and no note to write: its tree is
          // what was sent, including whatever note was true that day.
          if (t) node_.note = t('figure.unavailable')
        }
      }),
    )

    return images
  }

  /**
   * The report as a document.
   *
   * **The prose document is opened and released around the read.** Holding it
   * would keep a document alive for an export that has finished; not opening it
   * would render every written section empty, which is the failure a reader
   * cannot see.
   */
  async render(caseId: string, reportId: string, lang?: string): Promise<Rendered> {
    const [report] = await withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(reports)
        .where(and(eq(reports.id, reportId), eq(reports.caseId, caseId))),
    )
    if (!report) throw new NotFoundException(`No report ${reportId} in this case.`)

    // **Before anything is read from the case.** A frozen report's document
    // does not depend on the case at all any more, and reading it would be the
    // first step of the re-render this branch exists to prevent.
    if (report.frozen) {
      /**
       * **Not defanged again here, and that is not an omission.**
       */
      // **Parsed, not cast.** The frozen tree is the compliance artefact and
      // the only source a sent report is painted from; a stored tree that lost
      // or drifted a field fails here rather than painting a wrong document.
      const document_: Document = documentSchema.parse(report.frozen)
      return {
        document_,
        title: document_.title || report.label,
        frozen: true,
        images: await this.figures(document_, null),
      }
    }

    const caseData = (await this.cases.getWithCollections(caseId)) as unknown as CaseData
    const blocks = await withCase(this.db, caseId, (tx) =>
      tx
        .select()
        .from(reportBlocks)
        .where(and(eq(reportBlocks.caseId, caseId), eq(reportBlocks.reportId, reportId)))
        .orderBy(asc(reportBlocks.position)),
    )

    const title = report.label || caseData.title
    const prose = await this.prose.open(caseId, reportDocument(reportId))
    // **Resolved once, here.** This is the only place that knows both which
    // language the document is in and which install's packs it may use, and
    // resolving per label lookup would be a query per heading.
    const language = lang || report.language || 'en'
    const t = await this.languages.translatorFor(language)
    const languageCoverage = await this.languages.coverageOf(language)
    try {
      const document_ = resolveReport({
        title,
        tlp: report.tlp ?? '',
        language,
        t,
        languageCoverage,
        prose,
        caseData,
        blocks: blocks.map((row) => ({
          id: row.id,
          kind: row.kind,
          heading: row.heading,
          headingKey: row.headingKey,
          position: row.position,
          // The figure block's subject. Null on every other kind, and nulled by
          // the foreign key when the evidence it named is deleted.
          evidenceId: row.evidenceId,
        })),
      })
      const painted = defangDocument(document_)
      return { document_: painted, title, frozen: false, images: await this.figures(painted, t) }
    } catch (error) {
      if (error instanceof UnresolvableSections) {
        // **400, not 500.** The report holds a section this build cannot draw;
        // that is a fact about the document rather than a fault in the server,
        // and the analyst can act on it by removing or replacing the section.
        throw new BadRequestException(error.message)
      }
      throw error
    } finally {
      await this.prose.release(caseId, reportDocument(reportId))
    }
  }
}
