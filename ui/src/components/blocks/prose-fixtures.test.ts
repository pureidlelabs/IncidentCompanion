/**
 * The shared contract between the editor's schema and the Python encoder.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Editor } from '@tiptap/core'
import { prosemirrorToYXmlFragment } from '@tiptap/y-tiptap'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { proseExtensions } from './prose-schema'

const FIXTURES = resolve(__dirname, '../../../../tests/data/prose_fixtures.json')

/** Every construct a report body may hold, one per case. */
const CASES: Record<string, string> = {
  paragraph: 'A plain paragraph of narrative prose.',
  two_paragraphs: 'First paragraph.\n\nSecond paragraph.',
  heading_levels: '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six',
  bold: 'The **initial finding** was wrong.',
  italic: 'The *initial finding* was wrong.',
  bold_and_italic: 'The ***initial finding*** was wrong.',
  strike: 'The ~~initial finding~~ was wrong.',
  inline_code: 'Run `svc-backup` on the host.',
  link: 'See [the advisory](https://example.invalid/a) for detail.',
  bullet_list: '- first\n- second\n- third',
  ordered_list: '1. first\n2. second\n3. third',
  nested_list: '- outer\n  - inner\n- outer again',
  blockquote: '> Quoted from the report.',
  code_block: '```\nnet user svc-backup\n```',
  // **Two lines, because one line could not see the defect.** The document
  // path collapsed newlines like every other block and the corpus never
  // noticed - a command sequence reached Word as one run-on line.
  code_block_multiline: '```\nnet user svc-backup\nnet localgroup administrators /add\n```',
  code_block_language: '```bash\nnet user svc-backup\n```',
  horizontal_rule: 'Above\n\n---\n\nBelow',
  table: '| Host | Role |\n| --- | --- |\n| dc-01 | domain controller |\n| fs-02 | file server |',
  table_alignment: '| Left | Centre | Right |\n| :--- | :---: | ---: |\n| a | b | c |',
  table_marks: '| Host | Note |\n| --- | --- |\n| dc-01 | **compromised** on [day six](https://example.invalid/d) |',
  mixed: '## Root cause\n\nA **macro-enabled** attachment.\n\n- credential dump\n- lateral movement\n\n> Recovery ran from an offline copy.',
  empty: '',
  entities: 'Angle < bracket & ampersand "quoted" and an apostrophe\'s.',
}

/**
 * One text node, as its **runs** rather than as a string.
 */
interface TextNode { runs: { text: string; marks: Record<string, unknown> | null }[] }
interface ElementNode {
  tag: string
  attrs: Record<string, unknown>
  children: (TextNode | ElementNode)[]
}

/**
 * A structural dump, **because the two libraries do not serialise alike**.
 */
function walk(node: Y.XmlElement | Y.XmlText | Y.XmlHook): TextNode | ElementNode {
  if (node instanceof Y.XmlText) {
    const delta = node.toDelta() as { insert: string; attributes?: object }[]
    return {
      runs: delta.map((run) => ({
        text: run.insert,
        marks: (run.attributes ?? null) as Record<string, unknown> | null,
      })),
    }
  }
  const element = node as Y.XmlElement
  return {
    tag: element.nodeName,
    attrs: element.getAttributes(),
    children: element.toArray().map(walk),
  }
}

function treeFor(markdown: string): (TextNode | ElementNode)[] {
  const editor = new Editor({ extensions: proseExtensions(), content: '' })
  editor.commands.setContent(markdown)
  const doc = new Y.Doc({ gc: false })
  prosemirrorToYXmlFragment(editor.state.doc, doc.getXmlFragment('default'))
  const tree = doc.getXmlFragment('default').toArray().map(walk)
  editor.destroy()
  return tree
}

describe('the prose fixtures', () => {
  it('match what the editor and the Yjs binding actually produce', () => {
    const built = Object.fromEntries(
      Object.entries(CASES).map(([name, markdown]) => [
        name, { markdown, tree: treeFor(markdown) },
      ]),
    )

    if (process.env.UPDATE_PROSE_FIXTURES) {
      writeFileSync(FIXTURES, `${JSON.stringify(built, null, 1)}\n`)
    }

    const onDisk: unknown = JSON.parse(readFileSync(FIXTURES, 'utf8'))
    expect(onDisk).toEqual(built)
  })
})
