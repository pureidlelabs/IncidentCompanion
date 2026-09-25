/**
 * Render every address a document carries so no reader's software opens it.
 *
 * Everything here is a *render-time* transform: the case keeps real values,
 * which search, the graphs and every pivot need. One pass over the built
 * document covers every renderer, since all three start from `Document`.
 *
 * Two entry points, because the safe transform depends on what the caller
 * knows. `defangIndicator` takes a value the model says is entirely an
 * indicator, so every dot and `@` can go; `defangText` takes free text, where
 * only what a reader's software would link is rewritten. The rules and the
 * prose they spare are the report design record's.
 */
import { domainToUnicode } from 'node:url'

import type { Cell, Cover, Document, Node, Section } from './model.js'
import { ROOT_ZONE } from './tlds.js'

/**
 * Strict dotted-quad, octet-validated.
 *
 * `\d{1,3}` would take a version string -- `1.2.3.400`, `5.2.1.1964` -- for an
 * address and mangle it.
 */
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g

const URL_WITH_SCHEME = /\b[a-z][a-z\d+.-]*:\/\/[^\s<>"')\]]+/gi

/**
 * Scheme, host, and everything after it. The path is not an indicator.
 *
 * **The tail must open with a delimiter or be absent**, so it cannot exchange
 * characters with the host class and there is nothing to backtrack through.
 * `.*` there could not match a value holding a newline, and `[\s\S]*` could,
 * but overlapped `[^/?#]*` -- the shape `regexp/no-super-linear-backtracking`
 * names. This spelling satisfies the rule rather than
 * suppressing it, and answers identically on every case in `defang.test.ts`.
 */
const AUTHORITY = /^([a-z][a-z\d+.-]*:\/\/)([^/?#]*)([/?#][\s\S]*)?$/i

/** A UNC path's host: what follows the leading pair of backslashes. */
const UNC = /\\\\([^\\\s/]+)/g

/** The domain half of an email address; the local part is not an indicator. */
const EMAIL = /(?<=[\p{L}\p{N}._%+-])@([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)/gu

/**
 * A dotted name standing on its own, which `bareHost` then judges.
 *
 * **Not after `/`, `\`, `:`, `@`, `.` or `[`**, so a path segment, a file in a
 * Windows path, a port and a label already inside a defanged address are never
 * taken for a host of their own.
 */
const HOST = /(?<![\p{L}\p{N}_@.\\/:[-])(?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]+/gu

const SCHEMES: Readonly<Record<string, string>> = {
  http: 'hxxp',
  https: 'hxxps',
  ftp: 'fxp',
  ftps: 'fxps',
}
const REWRITTEN = new Set(Object.values(SCHEMES))

const TLDS = new Set(
  ROOT_ZONE.trim()
    .split(/\s+/)
    .flatMap((tld) => [tld, domainToUnicode(tld)]),
)

/** Top-level domains that name a file type far more often than a host in incident evidence. */
const FILE_TYPES = new Set([
  'cab',
  'map',
  'md',
  'mm',
  'mov',
  'one',
  'pl',
  'pm',
  'ps',
  'pub',
  'py',
  'rs',
  'run',
  'sc',
  'sh',
  'so',
  'tf',
  'zip',
])

/**
 * **A dot already inside `[.]` is left alone, which is what makes a second pass
 * harmless.** Without the guard `evil[.]com` becomes `evil[[.]]com`: the
 * bracket notation contains a dot of its own, so bracketing is *not* naturally
 * idempotent. A frozen report is re-painted from its stored tree, so a document
 * meeting this twice is an ordinary event rather than a mistake.
 */
const dots = (value: string) => value.replace(/(?<!\[)\.(?!\])/g, '[.]')

const ats = (value: string) => value.replace(/(?<!\[)@(?!\])/g, '[@]')

/** `http://` as `hxxp://`, and a scheme with no conventional spelling as `smb[:]//`. */
function scheme(value: string): string {
  const name = value.slice(0, -'://'.length)
  const lower = name.toLowerCase()
  const written = SCHEMES[lower]
  if (written) return (name === lower ? written : written.toUpperCase()) + '://'
  return REWRITTEN.has(lower) ? value : `${name}[:]//`
}

/** One URL: scheme and host only, path untouched. */
export function defangUrl(value: string): string {
  const match = AUTHORITY.exec(value)
  if (!match) return dots(value)
  // `?? ''` because the tail is optional: a bare host leaves it undefined,
  // and `+ undefined` appends the word rather than nothing.
  return scheme(match[1]!) + dots(match[2]!) + (match[3] ?? '')
}

/** A `www.` name whatever its ending, and any other only under a real top-level domain. */
function bareHost(found: string): string {
  const labels = found.split('.')
  const tld = labels.at(-1)!.toLowerCase()
  const host = /^www\d{0,3}$/i.test(labels[0]!) || (TLDS.has(tld) && !FILE_TYPES.has(tld))
  return host ? dots(found) : found
}

/**
 * A value that is *entirely* an indicator.
 *
 * Safe to blank every dot because the field it came from declares what it
 * holds. A value carrying a scheme still routes through `defangUrl`, so a URL
 * typed into a domain field keeps its path readable.
 */
export function defangIndicator(value: string): string {
  const text = value.trim()
  if (!text) return value
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text)) return defangUrl(text)
  return ats(dots(text))
}

/** The addresses embedded in free text, and nothing else. */
export function defangText(value: string): string {
  if (!value) return value
  return value
    .replace(URL_WITH_SCHEME, (found) => defangUrl(found))
    .replace(UNC, (_, host: string) => `\\\\${dots(host)}`)
    .replace(EMAIL, (_, host: string) => `[@]${dots(host)}`)
    .replace(IPV4, (found) => dots(found))
    .replace(HOST, bareHost)
}

function defangCell(cell: Cell): Cell {
  /**
   * **`chip` carries a vocabulary key the painters resolve and `tlp` a marking
   * flag**, never an address, so both are copied rather than walked. Defanging
   * a key would produce a value no painter can look up.
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
      return {
        ...node,
        items: node.items.map((item) => ({
          ...item,
          runs: item.runs.map((run) => ({ ...run, text: defangText(run.text) })),
        })),
      }
    case 'code':
      /**
       * **A code block is quoted evidence and is defanged as free text** -- a
       * command line carrying a C2 address autolinks in Word exactly like prose
       * does.
       *
       * **`verbatim` is the one exemption, and it is a property of the node
       * rather than of the arm.** A method's saved query leaves byte-exact
       * because a neutralised query does not run, which is the maintainer's
       * deliberate trade against an emailed RCA carrying a live address. The
       * flag is set by one producer; every other code block, a pasted result
       * included, still goes through the rule above.
       */
      if (node.verbatim) return node
      return { ...node, lines: node.lines.map(defangText) }
    case 'quote':
      /**
       * **Nothing reaches this arm, and it is still the right one.** A quote is
       * produced only by the fragment walk, which serves `written` blocks, and
       * `defangSection` returns those whole. What the arm answers is the day a
       * generated block carries a quotation: the runs shape is the rich
       * paragraph's, so the rule has to be too, and an arm that threw or passed
       * the node through would be the wrong default for a pass whose entire job
       * is not shipping live addresses.
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
       * filename and occasionally a URL somebody pasted - free text, so the
       * free-text rule applies, and it spares a filename such as `payload.zip`. The
       * note is this build's own sentence and the digest is hex; neither can
       * carry an address.
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
  // switch does not reach it -- the same gap the cover and the document title
  // sit in. `headingFor` returns the analyst's own `block.heading`, and a
  // generated block carries one too.
  return {
    ...section,
    heading: defangText(section.heading),
    nodes: section.nodes.map(defangNode),
  }
}

/**
 * **The cover is walked explicitly, because it is not a `Node`.**
 * `defangNode`'s switch is exhaustive, so a forgotten node kind is a compile
 * error; `Cover` is its own shape hanging off the document and reaches no
 * switch. Every string on it is free text off the case, all three painters draw
 * it, and Word autolinks what it is handed.
 */
function defangCover(cover: Cover): Cover {
  return {
    ...cover,
    eyebrow: defangText(cover.eyebrow),
    title: defangText(cover.title),
    subtitle: defangText(cover.subtitle),
    rows: cover.rows.map((row) => ({ ...row, value: defangCell(row.value) })),
  }
}

/**
 * Every generated string in a built document, defanged. Returns a new document:
 * a sent report's frozen tree is stored and read again, so mutating in place
 * would edit the artefact a reader came back for.
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
  // accepts a new field in silence, so a part of a built document goes unwalked
  // with nothing saying so.
  //
  // **It closes half the hole.** A *required* field added to `Document` fails
  // this return with TS2741; an *optional* one still passes, and `cover` is
  // optional -- so the shape most likely to be added is the one this catches
  // nothing about. What covers the rest is the test, which walks a document
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
