/**
 * Resolving a written section out of the CRDT.
 *
 * **Every case here is a way to lose an analyst's words silently.** A dropped
 * emphasis, a nested list flattened into one sequence, a merged cell that shifts
 * a value under the wrong header - none of them fail, and all of them ship a
 * document that says something slightly different from what was on screen.
 * Nobody re-reads a report against the editor before sending it.
 *
 * **The fixtures are built through the shared schema**, the way the editor
 * stores them - `prosemirrorJSONToYXmlFragment` against `proseSchema()` - so a
 * fixture cannot assert a shape the editor could not produce. A construct the
 * schema rejects can only enter the CRDT through a raw update that bypassed the
 * editor, and the two tests that need one build it by hand and say so.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'

import { nodesFromFragment } from './fragment.js'
import { proseSchema } from '../../domain/prose-schema.js'
import type { ListNode, QuoteNode, RichParaNode } from './model.js'

/** A section built the way the editor holds it: ProseMirror JSON through the schema. */
function section(content: unknown[]): ReturnType<typeof nodesFromFragment> {
  const doc = new Y.Doc({ gc: false })
  const fragment = doc.getXmlFragment('block')
  prosemirrorJSONToYXmlFragment(proseSchema(), { type: 'doc', content }, fragment)
  return nodesFromFragment(fragment)
}

const para = (...runs: unknown[]) => ({ type: 'paragraph', content: runs })
const run = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) })

describe('a written section', () => {
  it('keeps the emphasis the analyst typed', () => {
    // Marks live in the text node's own formatting; the schema resolves them,
    // where the old element walk reported one unstyled run and every bold
    // quietly disappeared from every report.
    const nodes = section([
      para(run('The account was '), run('compromised', [{ type: 'bold' }]), run(' at 03:14.')),
    ])

    const first = nodes[0] as RichParaNode
    expect(first.type).toBe('richPara')
    expect(first.runs.map((r) => r.text).join('')).toBe('The account was compromised at 03:14.')
    expect(first.runs.find((r) => r.bold)?.text).toBe('compromised')
  })

  it('carries a link target beside its text', () => {
    // The address has to render - a link whose text hides its destination is
    // worse than plain text in a document a customer forwards on.
    const nodes = section([
      para(run('the advisory', [{ type: 'link', attrs: { href: 'https://example.test/a' } }])),
    ])
    expect((nodes[0] as RichParaNode).runs[0]!.url).toBe('https://example.test/a')
  })

  it('clamps headings to two tiers and does not let one outrank its section', () => {
    const nodes = section([
      { type: 'heading', attrs: { level: 1 }, content: [run('Top')] },
      { type: 'heading', attrs: { level: 2 }, content: [run('Middle')] },
      { type: 'heading', attrs: { level: 3 }, content: [run('Deep')] },
      { type: 'heading', attrs: { level: 6 }, content: [run('Deeper')] },
    ])
    expect(nodes.map((node) => node.type)).toEqual(['subhead', 'subhead', 'minorHead', 'minorHead'])
  })

  it('keeps a nested list as detail rather than as a second sequence', () => {
    const nodes = section([
      {
        type: 'orderedList',
        content: [
          {
            type: 'listItem',
            content: [
              para(run('Rotate the credentials')),
              { type: 'bulletList', content: [{ type: 'listItem', content: [para(run('service accounts first'))] }] },
            ],
          },
          { type: 'listItem', content: [para(run('Re-image the host'))] },
        ],
      },
    ])

    const list = nodes[0] as ListNode
    expect(list.items.map((item) => [item.level, item.ordered])).toEqual([
      [0, true],
      [1, false],
      [0, true],
    ])
    expect(list.items[1]!.runs[0]!.text).toBe('service accounts first')
  })

  it('drops the empty paragraph the editor keeps for the caret', () => {
    expect(section([para()])).toEqual([])
  })

  it('reads a blockquote as a quote rather than flattening it to a paragraph', () => {
    const nodes = section([
      { type: 'blockquote', content: [para(run('Your files are '), run('encrypted', [{ type: 'bold' }]))] },
    ])
    expect(nodes[0]?.type).toBe('quote')
    expect((nodes[0] as QuoteNode).runs.map((r) => r.text).join('')).toBe('Your files are encrypted')
    expect((nodes[0] as QuoteNode).runs[1]?.bold).toBe(true)
  })

  it('keeps every paragraph of a multi-line quote', () => {
    const nodes = section([
      {
        type: 'blockquote',
        content: [para(run('Pay within 72 hours.')), para(run('Do not contact law enforcement.'))],
      },
    ])
    const quotes = nodes.filter((one) => one.type === 'quote')
    expect(quotes).toHaveLength(2)
    expect((quotes[1] as QuoteNode).runs[0]?.text).toBe('Do not contact law enforcement.')
  })

  it('drops a blockquote nobody typed into rather than painting an empty rule', () => {
    expect(section([{ type: 'blockquote', content: [para()] }])).toEqual([])
  })

  it('reads a code block as lines rather than as a paragraph', () => {
    const nodes = section([
      { type: 'codeBlock', attrs: { language: 'text' }, content: [run('net user\nnet group')] },
    ])
    expect(nodes[0]).toEqual({ type: 'code', lines: ['net user', 'net group'], language: 'text' })
  })

  it('resolves an untouched section to nothing at all', () => {
    const doc = new Y.Doc({ gc: false })
    expect(nodesFromFragment(doc.getXmlFragment('block'))).toEqual([])
  })

  /**
   * **An unknown node can only enter through a raw update that bypassed the
   * editor.** The shared schema rejects one at creation - `section()` cannot
   * build it, because the editor cannot either - so this is the only fixture
   * built by hand. The node is dropped, and what must hold is that it costs
   * only itself: the surrounding prose survives and the export does not fail. Dropping unschema'd content is the safe answer to a crafted
   * update; the shared schema is what stops a legitimate node ever reaching
   * here. -> `prose-schema.ts`
   */
  it('drops a raw unknown node without taking the section down with it', () => {
    const doc = new Y.Doc({ gc: false })
    const fragment = doc.getXmlFragment('block')
    const good = new Y.XmlElement('paragraph')
    const goodText = new Y.XmlText()
    goodText.insert(0, 'real prose')
    good.insert(0, [goodText])
    const unknown = new Y.XmlElement('callout')
    fragment.insert(0, [good, unknown])

    const nodes = nodesFromFragment(fragment)
    expect(nodes).toHaveLength(1)
    expect((nodes[0] as RichParaNode).runs[0]!.text).toBe('real prose')
  })
})
