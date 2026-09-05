/**
 * A report, resolved once into the neutral document every painter starts from.
 *
 * Word, PDF and markdown all read this one tree, and it is the tree a sent
 * report freezes.
 *
 * **A kind this build cannot resolve refuses the whole document**, naming every
 * such kind: a section that resolved to nothing would ship a customer report
 * missing its timeline with nothing on the page admitting it, and neither the
 * reader nor the analyst who sent it could tell that from an omitted section.
 */
import * as Y from 'yjs'

import { WRITTEN_BLOCK } from '../block-kinds.js'
import type { Translate } from './packs.js'
import { nodesFromFragment } from './fragment.js'
import {
  actions,
  caseHeader,
  entities,
  evidence,
  methods,
  indicators,
  timeline,
  type CaseData,
} from './sections.js'
import {
  glossary,
  impact,
  metrics,
  ribbon,
  rootCause,
  techniqueTable,
  techniques,
} from './derived.js'
import { figure } from './figure.js'
import { narrative } from './narrative.js'
import { execCard, killchain } from './visuals.js'
import type { Cover, Document, Node, Section } from './model.js'

/** What the resolver is given: the rows, and the document holding the prose. */
export interface ReportInput {
  title: string
  tlp: string
  language: string
  /**
   * What this document prints its furniture in, resolved once for `language`.
   *
   * Carried rather than looked up per call: packs are rows, so a global
   * `t(key, language)` would need a cache refreshed on upload. -> `packs.ts`
   */
  t: Translate
  /**
   * How much of English this install's pack carried, 0 to 1 - a property of the
   * row this document was rendered from, so a frozen report keeps the figure
   * that was true on the day it went out.
   */
  languageCoverage: number
  blocks: ReportBlock[]
  /** The report's Yjs document. Absent for a report nobody has typed into. */
  prose?: Y.Doc
  /**
   * The case and its collections, which every generated section reads. Passed
   * in rather than fetched, so rendering a document never depends on a live
   * database.
   */
  caseData?: CaseData
}

/** Raised when a section cannot be produced. Carries every kind, not the first. */
export class UnresolvableSections extends Error {
  constructor(readonly kinds: string[]) {
    super(
      `This build cannot render ${kinds.length === 1 ? 'a section' : 'sections'} of ` +
        `${kinds.join(', ')}. The export is refused rather than served short.`,
    )
    this.name = 'UnresolvableSections'
  }
}

/**
 * One block of a report, as the resolver walk sees it.
 *
 * `evidenceId` is a figure's subject and null on every other kind.
 */
export interface ReportBlock {
  id: string
  kind: string
  heading: string
  headingKey: string
  position: number
  evidenceId?: string | null
}

/**
 * Produces the nodes for one generated section from the case's own data. The
 * block is passed for the one kind that needs it: a figure draws the evidence
 * *this block* names.
 */
export type SectionResolver = (input: ReportInput, block: ReportBlock) => Node[]

/**
 * The generated kinds this build can produce.
 *
 * Every kind absent from here refuses the export, which is what keeps the list
 * honest about what this build can actually produce.
 */
export const RESOLVERS: Record<string, SectionResolver> = {
  case_header: caseHeader,
  timeline,
  evidence,
  methods,
  actions,
  entities,
  indicators,
  metrics,
  root_cause: rootCause,
  impact,
  glossary,
  ribbon,
  techniques,
  technique_table: techniqueTable,
  exec_card: execCard,
  killchain,
  narrative,
  figure,
}

/**
 * The heading a section prints: the analyst's own words if it has them, never
 * looked up; otherwise the key through the pack, which prints itself when the
 * pack has no entry.
 */
function headingFor(block: ReportInput['blocks'][number], t: Translate): string {
  if (block.heading) return block.heading
  if (block.headingKey) return t(block.headingKey)
  // A generated section with neither a heading nor a key titles itself from its
  // kind, through the pack. The written block is the exception: its words are
  // the analyst's, and a derived title would head every one "Written section".
  return block.kind === WRITTEN_BLOCK ? '' : t(`heading.${block.kind}`)
}

/**
 * The page the report opens on.
 *
 * An absent fact is left off here - the opposite rule to the case header
 * inside, which prints *Not recorded*: a column of blanks on the first page a
 * customer sees reads as a document that failed to render. Severity and the
 * marking are chips, being the two judgements on the page.
 */
function coverFor(input: ReportInput): Cover | undefined {
  const data = input.caseData
  if (!data) return undefined

  const customer = (data.customer ?? '').trim()
  const reference = (data.reference ?? '').trim() || (data.title ?? '').trim()
  const analyst = (data.analyst ?? '').trim()
  const severity = (data.severity ?? '').trim()
  const summary = (data.summary ?? '').trim()

  const rows: Cover['rows'] = []
  const fact = (label: string, value: string): void => {
    if (value) rows.push({ label: input.t(label), value: { text: value, bold: true } })
  }
  fact('field.customer', customer)
  fact('field.case_id', reference)
  fact('field.analyst', analyst)
  fact('field.status', (data.status ?? '').trim())
  if (severity) {
    rows.push({
      label: input.t('impact.severity'),
      value: { text: severity, chip: { kind: 'severity', value: severity } },
    })
  }
  if (input.tlp) {
    rows.push({ label: input.t('cover.classification'), value: { text: input.tlp, tlp: true } })
  }

  return {
    eyebrow: `IncidentCompanion \u00b7 ${input.t('report.title')}`.toUpperCase(),
    // **What happened, not which case.** The reference is on the line under it
    // and in the running footer; a cover headed by a case number tells the
    // reader something they can already see twice.
    title: summary || customer || reference,
    subtitle: [customer, reference, analyst].filter(Boolean).join(' \u00b7 '),
    rows,
  }
}

export function resolveReport(input: ReportInput): Document {
  const ordered = [...input.blocks].sort((a, b) => a.position - b.position)

  const unresolved = [
    ...new Set(
      ordered
        .filter((block) => block.kind !== WRITTEN_BLOCK && !(block.kind in RESOLVERS))
        .map((block) => block.kind),
    ),
  ]
  if (unresolved.length > 0) throw new UnresolvableSections(unresolved)

  const sections: Section[] = ordered.map((block) => {
    const nodes =
      block.kind === WRITTEN_BLOCK
        ? // **No document means no prose, not an error.** A report created and
          // never typed into has no bytes in its row, and that is an empty
          // section rather than a failure to render one.
          input.prose
          ? nodesFromFragment(input.prose.getXmlFragment(block.id))
          : []
        : RESOLVERS[block.kind]!(input, block)

    return { blockId: block.id, kind: block.kind, heading: headingFor(block, input.t), nodes }
  })

  return {
    title: input.title,
    tlp: input.tlp,
    cover: coverFor(input),
    language: input.language,
    languageCoverage: input.languageCoverage,
    sections,
  }
}
