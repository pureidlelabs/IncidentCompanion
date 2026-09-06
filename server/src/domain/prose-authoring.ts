/**
 * Writing prose into a report's document, as an analyst's editor would.
 *
 * **The written text of a report is a CRDT, not a column.** There is nowhere to
 * put a string: one `Y.Doc` per report, one fragment per block, and the client
 * types into it through Tiptap. So anything that *seeds* prose has to build the
 * same node shapes the editor would have produced, or the walk that paints the
 * document reads nothing. **`demos/content.seeder.ts` is the only caller** -
 * a snippet the library inserts is written by the client, not through here.
 *
 * **Markdown in, because that is what the source material is**: the demo
 * cases hold their report bodies as markdown strings. Only the subset those
 * actually use is understood - paragraphs,
 * `###` headings, `-` bullets, `>` quotations, and inline bold and code.
 * Anything else arrives as its own literal text rather than being silently
 * dropped: a demo whose prose quietly loses a line is worse than one that shows
 * the raw marker.
 *
 * **That fallback is a floor, not a finished answer**, which `>` is the worked
 * example of: it sat outside the subset, so every seeded quotation printed its
 * own marker in the PDF, the `.docx` and the archive. The rule keeps the words;
 * it does not make the document right.
 */
import * as Y from 'yjs'

import { fragmentFor } from './prose-fields.js'

interface Piece {
  text: string
  bold?: boolean
  code?: boolean
}

/**
 * Splits a line into runs on `**bold**` and `` `code` ``.
 *
 * **Non-greedy and single-pass.** A greedy `**` match takes everything between
 * the first and last marker on the line, which turns two emphasised phrases
 * into one that swallows the words between them.
 */
export function piecesOf(line: string): Piece[] {
  const pieces: Piece[] = []
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let at = 0
  let found: RegExpExecArray | null

  while ((found = pattern.exec(line)) !== null) {
    if (found.index > at) pieces.push({ text: line.slice(at, found.index) })
    if (found[1] !== undefined) pieces.push({ text: found[1], bold: true })
    else if (found[2] !== undefined) pieces.push({ text: found[2], code: true })
    at = found.index + found[0].length
  }
  if (at < line.length) pieces.push({ text: line.slice(at) })
  return pieces.length > 0 ? pieces : [{ text: line }]
}

/**
 * **The offset is counted, not read back from the text.** A `Y.XmlText` that is
 * not yet integrated into a document reports `length` 0 however much has been
 * inserted, so `insert(text.length, ...)` puts every run at the front and the
 * sentence comes back reversed. Measured: "macro execution was **not** blocked
 * by policy." painted as " blocked by policy.**not**macro execution was".
 *
 * **It survived a suite that checked the marks and the words.** Nothing
 * asserted the order, which is exactly the assertion a round-trip test does not
 * think to make.
 */
function textWith(pieces: Piece[]): Y.XmlText {
  const text = new Y.XmlText()
  let at = 0
  for (const piece of pieces) {
    /**
     * **An attributes object on every run, including the plain ones.** Yjs
     * continues the previous run's formatting when `insert` is given no
     * attributes at all, so the text after a bold phrase inherited the bold -
     * "was **not** blocked" painted as "was **not blocked by policy.**", the
     * emphasis running to the end of the paragraph.
     *
     * **Passing the marks off explicitly is not what fixes it; passing an
     * object is.** An empty object clears the formatting just as well -
     * measured, mutating these to a spread that omits the off marks leaves the
     * suite green, while passing `undefined` for a plain run turns it red. The
     * nulls stay because they say what the run *is* rather than relying on
     * that.
     */
    const marks: Record<string, true | null> = {
      bold: piece.bold ? true : null,
      code: piece.code ? true : null,
    }
    text.insert(at, piece.text, marks)
    at += piece.text.length
  }
  return text
}

function element(name: string, pieces: Piece[]): Y.XmlElement {
  const node = new Y.XmlElement(name)
  node.insert(0, [textWith(pieces)])
  return node
}

/**
 * Writes markdown into one block's fragment.
 *
 * **Blank lines separate paragraphs**, which is the whole of the block
 * structure the source material uses. A bullet run is collected into one list
 * rather than a list per line, because `nodesFromFragment` reads the items out
 * of a single `bulletList`.
 */
export function writeProse(doc: Y.Doc, blockId: string, markdown: string): void {
  const fragment = fragmentFor(doc, blockId)
  const nodes: Y.XmlElement[] = []
  const lines = markdown.split('\n')

  /**
   * **Collected like a bullet run, and for the same reason.** Consecutive `>`
   * lines are one quotation; a blockquote per line would paint as several
   * quotations from several people, and `nodesFromFragment` reads a paragraph
   * per line out of one `blockquote` anyway.
   */
  let quoted: Piece[][] = []
  const flushQuote = (): void => {
    if (quoted.length === 0) return
    const quote = new Y.XmlElement('blockquote')
    quote.insert(0, quoted.map((pieces) => element('paragraph', pieces)))
    nodes.push(quote)
    quoted = []
  }

  let bullets: Piece[][] = []
  const flushBullets = (): void => {
    if (bullets.length === 0) return
    const list = new Y.XmlElement('bulletList')
    list.insert(
      0,
      bullets.map((pieces) => {
        const item = new Y.XmlElement('listItem')
        item.insert(0, [element('paragraph', pieces)])
        return item
      }),
    )
    nodes.push(list)
    bullets = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') {
      flushBullets()
      flushQuote()
      continue
    }

    // Safe because `line` holds no newline, not because the shape is: this
    // runs per line, so `$` has no interior newline to fail at. The same
    // shape in `defang.ts` is bounded differently.
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushBullets()
      flushQuote()
      const node = new Y.XmlElement('heading')
      node.setAttribute('level', String(heading[1]!.length))
      node.insert(0, [textWith(piecesOf(heading[2]!))])
      nodes.push(node)
      continue
    }

    // Same shape and the same reason as the heading above.
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      flushQuote()
      bullets.push(piecesOf(bullet[1]!))
      continue
    }

    // The space after the marker is optional, because an analyst pasting a
    // note types `>text` as readily as `> text`.
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      flushBullets()
      quoted.push(piecesOf(quote[1]!))
      continue
    }

    flushBullets()
    flushQuote()
    nodes.push(element('paragraph', piecesOf(line)))
  }
  flushBullets()
  flushQuote()

  if (nodes.length > 0) fragment.insert(fragment.length, nodes)
}
