/**
 * Writing prose into a report's document, as an analyst's editor would.
 */
import * as Y from 'yjs'

import { fragmentFor } from './prose-fields.js'

/** One run of text with the marks the editor would have set on it. */
interface Piece {
  text: string
  bold?: boolean
  code?: boolean
}

/**
 * Splits a line into runs on `**bold**` and `` `code` ``.
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
 * **The offset is counted, not read back from the text.**
 */
function textWith(pieces: Piece[]): Y.XmlText {
  const text = new Y.XmlText()
  let at = 0
  for (const piece of pieces) {
    /**
     * **An attributes object on every run, including the plain ones.**
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
 */
export function writeProse(doc: Y.Doc, blockId: string, markdown: string): void {
  const fragment = fragmentFor(doc, blockId)
  const nodes: Y.XmlElement[] = []
  const lines = markdown.split('\n')

  /**
   * **Collected like a bullet run, and for the same reason.**
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
