/**
 * The markdown painter: the document, as text.
 *
 * Resolves no data and makes no layout decisions: if a section reads wrong here
 * it reads wrong in Word too. Escaping is this painter's own, since the model
 * carries runs rather than markup.
 */
import { coverageNote, type Cell, type Document, type ListItem, type Node, type Run, type Section, type TableNode } from './model.js'

/**
 * Characters that start a markdown construct at the beginning of a line, or
 * change one mid-line.
 *
 * **`.` and `)` are escaped only after a digit**, which is the one place they
 * make an ordered list - escaping them everywhere puts a backslash into every
 * sentence that ends in a full stop.
 */
function escape(text: string): string {
  return text
    .replace(/([\\`*_{}[\]<>#+|~])/g, '\\$1')
    .replace(/^(\s*)(\d+)([.)])/gm, '$1$2\\$3')
    .replace(/^(\s*)-/gm, '$1\\-')
}

/**
 * One run, with its emphasis.
 *
 * **The URL renders beside the text rather than as a link**, and collapses when
 * the two are the same. A defanged address cannot be clickable anyway, and a
 * link whose text hides its destination is worse than plain text in a document
 * a customer forwards on.
 */
function paint(run: Run): string {
  let text = run.code ? '`' + run.text.replace(/`/g, '') + '`' : escape(run.text)
  if (run.bold) text = `**${text}**`
  if (run.italic) text = `*${text}*`
  if (run.url && run.url !== run.text) text = `${text} (${escape(run.url)})`
  return text
}

const inline = (runs: Run[]): string => runs.map(paint).join('')

/**
 * A cell's text.
 *
 * **A pipe inside a cell is escaped, not stripped.** A command line holding one
 * is ordinary evidence, and a stripped pipe changes what the reader is told the
 * attacker ran; an unescaped one breaks the row into extra columns.
 */
function cellText(cell: Cell): string {
  // **`escape` already covers the pipe**, and escaping it a second time here
  // put a literal backslash in front of every one - visible in the document,
  // on every command line in every table.
  const text = escape(cell.text).replace(/\n/g, ' ')
  // **An empty cell stays empty, whatever its semantic.** A mono cell with no
  // value rendered as a bare pair of backticks - visible in every timeline row
  // with no technique, and read as a value that failed to print.
  const marked =
    cell.mono && cell.text !== '' ? '`' + cell.text.replace(/[`|]/g, '') + '`' : text
  return cell.bold ? `**${marked}**` : marked
}

function table(node: TableNode): string[] {
  if (node.rows.length === 0 && !node.header) return []
  const columns = node.header?.length ?? node.rows[0]?.length ?? 0
  if (columns === 0) return []

  const lines: string[] = []
  // **A header is always emitted, even when the model has none.** Markdown has
  // no headerless table: without the separator row the whole block renders as
  // one paragraph of pipes.
  const header = node.header ?? Array.from({ length: columns }, () => '')
  lines.push(`| ${header.map(escape).join(' | ')} |`)
  lines.push(`| ${header.map(() => '---').join(' | ')} |`)
  for (const row of node.rows) lines.push(`| ${row.map(cellText).join(' | ')} |`)
  return lines
}

/**
 * A list item's line.
 *
 * **The painter counts; the source does not.** A markdown `1. / 1. / 1.` is a
 * legal ordered list, so honouring typed digits numbers three items all `1`.
 * The counter restarts when the list leaves a level.
 */
function list(items: ListItem[]): string[] {
  const counters = new Map<number, number>()
  let previous = 0
  const lines: string[] = []

  for (const item of items) {
    if (item.level < previous) {
      for (const level of [...counters.keys()]) if (level > item.level) counters.delete(level)
    }
    previous = item.level
    const indent = '  '.repeat(item.level)
    if (item.ordered) {
      const next = (counters.get(item.level) ?? 0) + 1
      counters.set(item.level, next)
      lines.push(`${indent}${String(next)}. ${inline(item.runs)}`)
    } else {
      counters.delete(item.level)
      lines.push(`${indent}- ${inline(item.runs)}`)
    }
  }
  return lines
}

function node(one: Node): string[] {
  switch (one.type) {
    case 'richPara':
      return [inline(one.runs)]
    case 'prose':
      return one.paras.map(escape)
    case 'subtitle':
      return [`# ${escape(one.text)}`]
    case 'subhead':
      return [`### ${escape(one.text)}`]
    case 'minorHead':
      return [`#### ${escape(one.text)}`]
    case 'list':
      return list(one.items)
    case 'code':
      return ['```' + (one.language ?? ''), ...one.lines, '```']
    // The one node whose markdown spelling is the thing the analyst saw
    // arriving as literal text before this existed.
    case 'quote':
      return [`> ${inline(one.runs)}`]
    /**
     * **The path in words, because the archive is text.** A `.md` carries no
     * picture by design - the same rule that keeps a figure's SHA-256 in the
     * archive and not its bytes - so the phases are written in order with the
     * separator the PDF's line stands for, and the foot follows as its own
     * line. Nothing is lost that a reader of a text file could have used.
     */
    case 'spine':
      return [one.phases.map((phase) => escape(phase.label)).join(' \u203a '), '', escape(one.foot)]
    /**
     * **The caption and the digest, never the image.** A base64 data URI makes
     * the archive unreadable and undiffable for a picture already sitting in
     * the evidence store beside it - and the digest is what lets a reader match
     * this figure to the row in the evidence table.
     */
    case 'figure': {
      const lines = [`*${escape(one.caption)}*`]
      if (one.note) lines.push(escape(one.note))
      return lines
    }
    case 'divider':
      return ['---']
    case 'table':
      return table(one)
  }
}

function section(one: Section): string[] {
  const lines: string[] = []
  // **A heading only when there is one.** A written section the analyst left
  // untitled prints its prose and nothing else; an empty `##` is a rule across
  // the page with no words on it.
  if (one.heading) lines.push(`## ${escape(one.heading)}`)
  for (const child of one.nodes) lines.push(...node(child), '')
  return lines
}

/**
 * The whole document as markdown: the marking leads, being a handling
 * instruction, and the coverage note sits under it before the first section -
 * a reader meeting mixed languages needs the reason before the damage.
 */
export function toMarkdown(document_: Document): string {
  const lines: string[] = [`# ${escape(document_.title)}`, '']
  if (document_.tlp) lines.push(`**${escape(document_.tlp)}**`, '')
  const note = coverageNote(document_)
  if (note) lines.push(`*${escape(note)}*`, '')

  /**
   * **The cover's facts, as a list rather than a band.** The archival tier has
   * no colour and no page, so a chip is its words - but the *facts* are what a
   * reader of the `.md` would otherwise have to go to the case for, and this is
   * the copy that is kept. The headline is the report's own title line, which
   * is already the `#` above.
   */
  if (document_.cover) {
    if (document_.cover.subtitle) lines.push(`*${escape(document_.cover.subtitle)}*`, '')
    if (document_.cover.title) lines.push(escape(document_.cover.title), '')
    for (const row of document_.cover.rows) {
      lines.push(`- **${escape(row.label)}:** ${escape(row.value.text)}`)
    }
    if (document_.cover.rows.length > 0) lines.push('')
  }
  for (const one of document_.sections) lines.push(...section(one))

  // One trailing newline, and never a run of blank lines: a section that
  // resolved to nothing must not leave a gap the reader takes for a missing
  // paragraph.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
