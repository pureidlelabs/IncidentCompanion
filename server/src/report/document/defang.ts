/**
 * Render indicators unclickable in a report that leaves the app.
 */
import type { Cell, Cover, Document, Node, Section } from './model.js'

/**
 * Strict dotted-quad, octet-validated.
 */
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g

/** Recognised only with a scheme: without one, a host and a filename are the same shape. */
const URL_WITH_SCHEME = /\bhttps?:\/\/[^\s<>"')\]]+/gi

/**
 * Scheme, host, and everything after it. The path is not an indicator.
 */
const AUTHORITY = /^(https?:\/\/)([^/?#]*)([/?#][\s\S]*)?$/i

/**
 * **A dot already inside `[.]` is left alone, which is what makes a second
 * pass harmless.**
 */
const dots = (value: string) => value.replace(/(?<!\[)\.(?!\])/g, '[.]')

/** `http` -> `hxxp`, keeping the case it was typed in. */
function scheme(value: string): string {
  return value.replace(/^http/i, (found) => (found === found.toLowerCase() ? 'hxxp' : 'HXXP'))
}

/** One URL: scheme and host only, path untouched. */
export function defangUrl(value: string): string {
  const match = AUTHORITY.exec(value)
  if (!match) return dots(value)
  // `?? ''` because the tail is optional: a bare host leaves it undefined,
  // and `+ undefined` appends the word rather than nothing.
  return scheme(match[1]!) + dots(match[2]!) + (match[3] ?? '')
}

/**
 * A value that is *entirely* an indicator.
 */
export function defangIndicator(value: string): string {
  const text = value.trim()
  if (!text) return value
  if (/^https?:\/\//i.test(text)) return defangUrl(text)
  return dots(text)
}

/**
 * The indicators embedded in free text, and nothing else.
 */
export function defangText(value: string): string {
  if (!value) return value
  return value
    .replace(URL_WITH_SCHEME, (found) => defangUrl(found))
    .replace(IPV4, (found) => dots(found))
}

function defangCell(cell: Cell): Cell {
  /**
   * **`chip` and `tlp` carry vocabulary keys the painters resolve**, never an
   * address, so they are copied rather than walked.
   */
  const text = cell.indicator ? defangIndicator(cell.text) : defangText(cell.text)
  return text === cell.text ? cell : { ...cell, text }
}

function defangNode(node: Node): Node {
  switch (node.type) {
    case 'table':
      return {
        ...node,
        ...(node.header ? { header: node.header.map(defangText) } : {}),
        rows: node.rows.map((row) => row.map(defangCell)),
      }
    case 'prose':
      return { ...node, paras: node.paras.map(defangText) }
    case 'richPara':
      return { ...node, runs: node.runs.map((run) => ({ ...run, text: defangText(run.text) })) }
    case 'list':
      // A list item is runs, not a string -- the same shape a rich paragraph
      // carries, so it defangs the same way.
      return {
        ...node,
        items: node.items.map((item) => ({
          ...item,
          runs: item.runs.map((run) => ({ ...run, text: defangText(run.text) })),
        })),
      }
    case 'code':
      /**
       * **A code block is quoted evidence and is defanged as free text.**
       */
      if (node.verbatim) return node
      return { ...node, lines: node.lines.map(defangText) }
    case 'quote':
      /**
       * **Unreachable today, and it is still the right arm.**
       */
      return { ...node, runs: node.runs.map((run) => ({ ...run, text: defangText(run.text) })) }
    case 'subtitle':
    case 'subhead':
    case 'minorHead':
      return { ...node, text: defangText(node.text) }
    case 'spine':
      // Phase names are a fixed vocabulary and the foot is a count, so there is
      // no case value in here to bracket. Copied like `divider` rather than
      // walked - defanging `command and control` would only damage it.
      return node
    case 'figure':
      /**
       * **The caption is an evidence record's own name**, which is routinely a
       * filename and occasionally a URL somebody pasted - free text, so the free-
       * text rule applies: IPv4 and scheme-carrying addresses only, and no guess at
       * a bare host, or `payload.zip` becomes `payload[.]zip`.
       */
      return { ...node, caption: defangText(node.caption) }
    case 'divider':
      return node
  }
}

/**
 * **A written section is the analyst's prose and is left whole.** They defang
 * by convention already, and rewriting their words is not this pass's business.
 */
const WRITTEN = 'written'

function defangSection(section: Section): Section {
  if (section.kind === WRITTEN) return section
  // **The heading as well as the nodes.** It is not a `Node`, so the exhaustive
  // switch never reached it - the same shape that missed the cover and the
  // document title. `headingFor` returns the analyst's own `block.heading`, and
  // a generated block carries one too.
  return {
    ...section,
    heading: defangText(section.heading),
    nodes: section.nodes.map(defangNode),
  }
}

/**
 * **The cover is walked explicitly, because it is not a `Node`.**
 */
function defangCover(cover: Cover): Cover {
  return {
    ...cover,
    eyebrow: defangText(cover.eyebrow),
    title: defangText(cover.title),
    subtitle: defangText(cover.subtitle),
    // Through `defangCell`, so a row the builder marked as an indicator keeps
    // the indicator rule rather than the prose one.
    rows: cover.rows.map((row) => ({ ...row, value: defangCell(row.value) })),
  }
}

/**
 * Every generated string in a built document, defanged.
 */
export function defangDocument({
  title,
  tlp,
  language,
  languageCoverage,
  cover,
  sections,
}: Document): Document {
  // **Destructured and returned as a literal, not spread.** `...document_`
  // accepts a new field in silence, which is how the cover came to be the one
  // part of a built document nothing walked.
  //
  // **It closes half the hole, measured.** A *required* field added to
  // `Document` fails this return with TS2741; an *optional* one still passes,
  // and `cover` is optional - so the exact shape that caused this would not be
  // caught by it. What covers the rest is the test, which walks a document
  // carrying every part.
  return {
    title: defangText(title),
    tlp,
    language,
    languageCoverage,
    cover: cover ? defangCover(cover) : cover,
    sections: sections.map(defangSection),
  }
}
