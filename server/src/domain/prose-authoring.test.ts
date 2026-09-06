/**
 * **Prose written in comes back out as the same prose.**
 *
 * Asserted through `nodesFromFragment` rather than by reading the Yjs tree,
 * because the property that matters is the round trip: the seeder and the walk
 * are the two halves that have to agree, and a test reading the tree would
 * check the seeder against itself.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { piecesOf, writeProse } from './prose-authoring.js'
import { nodesFromFragment, fragmentFor } from '../report/document/fragment.js'
import type { Node } from '../report/document/model.js'

const roundTrip = (markdown: string): Node[] => {
  const doc = new Y.Doc({ gc: false })
  writeProse(doc, 'block-1', markdown)
  return nodesFromFragment(fragmentFor(doc, 'block-1'))
}

describe('splitting a line into runs', () => {
  it('finds bold and code', () => {
    expect(piecesOf('a **b** and `c`')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' and ' },
      { text: 'c', code: true },
    ])
  })

  /**
   * **Non-greedy, and this is the case that decides it.** A greedy `**` match
   * takes everything from the first marker to the last, so two emphasised
   * phrases become one that swallows the words between them.
   */
  it('does not run two emphasised phrases together', () => {
    expect(piecesOf('**one** plain **two**')).toEqual([
      { text: 'one', bold: true },
      { text: ' plain ' },
      { text: 'two', bold: true },
    ])
  })

  it('leaves a line with no markers alone', () => {
    expect(piecesOf('plain words')).toEqual([{ text: 'plain words' }])
  })
})

describe('writing prose into a block', () => {
  it('makes a paragraph per blank-line-separated run', () => {
    const nodes = roundTrip('First para.\n\nSecond para.')
    expect(nodes).toHaveLength(2)
    expect(nodes.every((node) => node.type === 'richPara')).toBe(true)
  })

  /**
   * **The words come back in the order they were written.** Two defects hid
   * behind a suite that checked the marks and the words and never the order:
   * an un-integrated `Y.XmlText` reports `length` 0, so inserting at
   * `text.length` put every run at the front - "macro execution was **not**
   * blocked by policy." came back as " blocked by policy.**not**macro
   * execution was".
   */
  it('keeps the runs in the order they were written', () => {
    const [node] = roundTrip('macro execution was **not** blocked by policy.')
    const runs = (node as { runs: { text: string }[] }).runs
    expect(runs.map((run) => run.text).join('')).toBe(
      'macro execution was not blocked by policy.',
    )
  })

  /**
   * **A mark stops where its run stops.** Yjs continues the previous run's
   * formatting when an attribute is absent rather than off, so the plain text
   * after an emphasised phrase inherited the emphasis - the bold ran to the end
   * of the paragraph and every assertion about marks still passed.
   */
  it('does not let a mark bleed into the run after it', () => {
    const [node] = roundTrip('was **not** blocked')
    const runs = (node as { runs: { text: string; bold?: boolean }[] }).runs
    const bolded = runs.filter((run) => run.bold).map((run) => run.text)
    expect(bolded).toEqual(['not'])
  })

  it('carries bold and code through as marks, not as markers', () => {
    const [node] = roundTrip('a **bold** and `mono` word')
    const runs = (node as { runs: { text: string; bold?: boolean; code?: boolean }[] }).runs
    expect(runs.find((run) => run.text === 'bold')?.bold).toBe(true)
    expect(runs.find((run) => run.text === 'mono')?.code).toBe(true)
    expect(runs.map((run) => run.text).join('')).not.toContain('**')
  })

  /** `###` is a minor head; `##` and above are subheads. Both are read off the level. */
  it('reads a heading at the level it was written', () => {
    expect(roundTrip('## Big')[0]!.type).toBe('subhead')
    expect(roundTrip('### Small')[0]!.type).toBe('minorHead')
  })

  /**
   * **A bullet run is one list, not a list per line.** The walk reads items out
   * of a single `bulletList`, so a list per line paints as several one-item
   * lists - visibly wrong in Word and invisible to a test that only counts
   * nodes.
   */
  it('collects a bullet run into one list', () => {
    const nodes = roundTrip('- one\n- two\n- three')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.type).toBe('list')
    expect((nodes[0] as { items: unknown[] }).items).toHaveLength(3)
  })

  it('closes a list when the prose resumes', () => {
    const nodes = roundTrip('- one\n- two\n\nAfter.')
    expect(nodes.map((node) => node.type)).toEqual(['list', 'richPara'])
  })

  /**
   * **An unrecognised marker keeps its words.** Prose that quietly loses a line
   * is worse than prose showing a raw marker: nobody re-reads a demo before
   * sending it, and the loss is invisible in every suite.
   *
   * **The input has to be a construct the subset still refuses.** It was
   * `> a quotation` until quotes were understood, at which point the assertion
   * covered nothing while staying green - it reads the words out of the JSON,
   * and they are there whether the line arrives as a quote, a paragraph, or
   * its own literal text.
   */
  it('keeps a line it does not understand', () => {
    const [node] = roundTrip('| column | column |')
    expect(JSON.stringify(node)).toContain('| column | column |')
  })

  /**
   * **An unhandled marker reaches customer documents.** The subset leaves what
   * it does not understand as literal text on purpose - a demo whose prose
   * quietly loses a line is worse than one showing a marker - so a `>` nothing
   * handles prints as `> Your files have been encrypted` in the PDF, the
   * `.docx` and the archive alike.
   */
  it('reads a quoted line as a quote rather than as its own marker', () => {
    const [node] = roundTrip('> Your files have been **encrypted**')
    expect(node?.type).toBe('quote')
    expect(JSON.stringify(node)).not.toContain('&gt;')
    expect(JSON.stringify(node)).not.toContain('"> ')
  })

  it('keeps the emphasis inside a quotation', () => {
    const [node] = roundTrip('> pay within **72 hours**')
    // Both halves: bold alone passes with the line read as a paragraph.
    expect(node?.type).toBe('quote')
    expect(JSON.stringify(node)).toContain('"bold":true')
  })

  /**
   * Consecutive `>` lines are one quotation, not one per line - the same
   * collection rule the bullet run uses, and for the same reason.
   */
  it('collects consecutive quoted lines into one quotation', () => {
    const nodes = roundTrip('> first line\n> second line')
    expect(nodes.every((one) => one.type === 'quote')).toBe(true)
    expect(nodes).toHaveLength(2)
    expect(JSON.stringify(nodes[1])).toContain('second line')
  })

  /**
   * **A quotation ends where the prose resumes**, or the analyst's own next
   * sentence is attributed to whoever they were quoting.
   */
  it('does not swallow the paragraph after a quotation', () => {
    const nodes = roundTrip('> they demanded payment\n\nWe did not pay.')
    expect(nodes[0]?.type).toBe('quote')
    expect(nodes[1]?.type).toBe('richPara')
    expect(JSON.stringify(nodes[1])).toContain('We did not pay.')
  })

  it('reads a quote marker with no space after it', () => {
    expect(roundTrip('>tight')[0]?.type).toBe('quote')
  })

  it('writes nothing for empty markdown', () => {
    expect(roundTrip('')).toEqual([])
    expect(roundTrip('\n\n  \n')).toEqual([])
  })

  /**
   * **Each block owns its own fragment.** They share one document per report,
   * so a seeder writing to the wrong field would pile every section's prose
   * into one block - and the report would still export, just wrongly.
   */
  it('keeps one block\u2019s prose out of another\u2019s', () => {
    const doc = new Y.Doc({ gc: false })
    writeProse(doc, 'a', 'Alpha.')
    writeProse(doc, 'b', 'Beta.')
    expect(JSON.stringify(nodesFromFragment(fragmentFor(doc, 'a')))).toContain('Alpha')
    expect(JSON.stringify(nodesFromFragment(fragmentFor(doc, 'a')))).not.toContain('Beta')
  })
})
