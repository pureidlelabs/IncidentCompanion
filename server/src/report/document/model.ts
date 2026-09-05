/**
 * The report as a neutral document model, painted by Word, PDF and markdown
 * alike.
 */
import { z } from 'zod'

/** A span of inline text with its emphasis, and the link it came from. */
export const runSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  code: z.boolean().optional(),
  /**
   * Carried and never made clickable: it renders as `text (url)`, collapsed
   * when the two are equal.
   */
  url: z.string().optional(),
})
export type Run = z.infer<typeof runSchema>

/**
 * One table cell, described by what it means rather than how it is drawn.
 */
export const cellSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  mono: z.boolean().optional(),
  ink: z.string().optional(),
  align: z.enum(['left', 'right', 'center']).optional(),
  kvLabel: z.boolean().optional(),
  chip: z.object({ kind: z.string(), value: z.string() }).optional(),
  tlp: z.boolean().optional(),
  fill: z.string().optional(),
  indicator: z.boolean().optional(),
  /**
   * How many columns or rows this cell claims, when an analyst pasted a merged
   * one.
   */
  colSpan: z.number().optional(),
  rowSpan: z.number().optional(),
})
export type Cell = z.infer<typeof cellSchema>

export const tableNodeSchema = z.object({
  type: z.literal('table'),
  /** Absent for a table that is a key/value list rather than a grid. */
  header: z.array(z.string()).optional(),
  rows: z.array(z.array(cellSchema)),
  /**
   * **One list of widths that every painter honours**, so the drift that had
   * Word and PDF disagreeing per column cannot recur.
   */
  widths: z.array(z.number()),
  zebra: z.boolean().optional(),
})
export type TableNode = z.infer<typeof tableNodeSchema>

export const proseNodeSchema = z.object({
  type: z.literal('prose'),
  paras: z.array(z.string()),
})
export type ProseNode = z.infer<typeof proseNodeSchema>

export const richParaNodeSchema = z.object({
  type: z.literal('richPara'),
  runs: z.array(runSchema),
})
export type RichParaNode = z.infer<typeof richParaNodeSchema>

/** The report's own title line. */
export const subtitleNodeSchema = z.object({
  type: z.literal('subtitle'),
  text: z.string(),
})
export type SubtitleNode = z.infer<typeof subtitleNodeSchema>

export const subheadNodeSchema = z.object({
  type: z.literal('subhead'),
  text: z.string(),
})
export type SubheadNode = z.infer<typeof subheadNodeSchema>

/**
 * The second and last heading tier a written block can reach.
 */
export const minorHeadNodeSchema = z.object({
  type: z.literal('minorHead'),
  text: z.string(),
})
export type MinorHeadNode = z.infer<typeof minorHeadNodeSchema>

/**
 * One line of a list, carrying its own `ordered`.
 */
export const listItemSchema = z.object({
  runs: z.array(runSchema),
  level: z.number(),
  ordered: z.boolean(),
})
export type ListItem = z.infer<typeof listItemSchema>

/**
 * A list. Numbering is the painter's, not the source's: every painter counts,
 * and restarts a level's counter when the list leaves that level.
 */
export const listNodeSchema = z.object({
  type: z.literal('list'),
  items: z.array(listItemSchema),
})
export type ListNode = z.infer<typeof listNodeSchema>

/** Preformatted text, painted in the mono face and never wrapped. */
export const codeNodeSchema = z.object({
  type: z.literal('code'),
  lines: z.array(z.string()),
  language: z.string().optional(),
  /**
   * Carry these lines out of the app exactly as they are, past the defang
   * pass.
   */
  verbatim: z.boolean().optional(),
})
export type CodeNode = z.infer<typeof codeNodeSchema>

/**
 * Somebody else's words, quoted: an attacker's ransom note, a vendor advisory,
 * a line out of a ticket.
 */
export const quoteNodeSchema = z.object({
  type: z.literal('quote'),
  runs: z.array(runSchema),
})
export type QuoteNode = z.infer<typeof quoteNodeSchema>

/**
 * The kill chain as a path of diamonds - the only node in this model that is a
 * drawing rather than a shaded table.
 */
export const spineNodeSchema = z.object({
  type: z.literal('spine'),
  phases: z.array(z.object({ label: z.string(), fill: z.string() })),
  /** Reached-of-total, stated under the drawing. */
  foot: z.string(),
})
export type SpineNode = z.infer<typeof spineNodeSchema>

/**
 * An evidence image the analyst placed, and its caption.
 */
export const figureNodeSchema = z.object({
  type: z.literal('figure'),
  caption: z.string(),
  /** Absent when the block names no evidence, or the record is gone. */
  hash: z.string().optional(),
  widthPt: z.number(),
  heightPt: z.number(),
  note: z.string().optional(),
})
export type FigureNode = z.infer<typeof figureNodeSchema>

/** A rule between sections, where a layout asks for one. */
export const dividerNodeSchema = z.object({ type: z.literal('divider') })
export type DividerNode = z.infer<typeof dividerNodeSchema>

export const nodeSchema = z.discriminatedUnion('type', [
  tableNodeSchema,
  proseNodeSchema,
  richParaNodeSchema,
  subtitleNodeSchema,
  subheadNodeSchema,
  minorHeadNodeSchema,
  listNodeSchema,
  codeNodeSchema,
  quoteNodeSchema,
  spineNodeSchema,
  figureNodeSchema,
  dividerNodeSchema,
])
export type Node = z.infer<typeof nodeSchema>

/**
 * The bytes for every figure in a document, keyed on the digest its node
 * carries.
 */
export type Images = ReadonlyMap<string, Uint8Array>

/**
 * The page a report opens on, before any section: a full-bleed band, one long
 * headline, and a key/value block whose values are chips.
 */
export const coverSchema = z.object({
  /** The small line above the headline. */
  eyebrow: z.string(),
  /** What the incident was, in the analyst's own words. */
  title: z.string(),
  /** Customer, case and analyst, as one line. */
  subtitle: z.string(),
  rows: z.array(z.object({ label: z.string(), value: cellSchema })),
})
export type Cover = z.infer<typeof coverSchema>

/** One resolved section: its heading, and the nodes under it. */
export const sectionSchema = z.object({
  /** The block this came from, so a painter can anchor a bookmark on it. */
  blockId: z.string(),
  kind: z.string(),
  /** Empty for a section the layout prints unheaded. */
  heading: z.string(),
  nodes: z.array(nodeSchema),
})
export type Section = z.infer<typeof sectionSchema>

/**
 * A whole report, resolved once. Every painter starts here, and this is the
 * tree a sent report freezes - so re-painting it later reproduces what left.
 */
export const documentSchema = z.object({
  title: z.string(),
  /** The marking printed on every page, or empty. */
  tlp: z.string(),
  /** The opening page, absent on a document frozen before there were covers. */
  cover: coverSchema.optional(),
  language: z.string(),
  /**
   * How much of that language this build carried, 0 to 1 - recorded rather than
   * computed at paint time, so a frozen report keeps the figure that was true
   * on the day it was sent.
   */
  languageCoverage: z.number(),
  sections: z.array(sectionSchema),
})
export type Document = z.infer<typeof documentSchema>

/**
 * The caveat a partly-translated document owes its reader, or `null`. All three
 * painters print this string rather than formatting the number themselves.
 */
export function coverageNote(document_: Document): string | null {
  if (document_.languageCoverage >= 1) return null
  const percent = Math.floor(Math.max(0, document_.languageCoverage) * 100)
  return (
    `This report is set to ${languageName(document_.language)}, of which this install ` +
    `carried ${String(percent)}%. The remaining labels print in English.`
  )
}

/**
 * `nl` -> `Dutch`.
 */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}
