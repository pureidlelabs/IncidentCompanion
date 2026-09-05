/**
 * That a method's query leaves the app exactly as it was run, and that nothing
 * else does.
 *
 * **This is a security control, and it is the maintainer's deliberate exemption.**
 * `defang.ts` exists because an RCA is emailed and Word autolinks a bare
 * address, so a live C2 host in a report is one click from the reader. The
 * owner ruled that a saved query is worth the cost anyway: a defanged query
 * pasted into a console fails, and a reader who cannot re-run the query cannot
 * check the finding.
 *
 * **So the exemption is a flag on one node, never the `code` arm.** The attack
 * this file is written from is the widening: the cheapest implementation is
 * `case 'code': return node`, which quietly carries every pasted command line
 * in every written section out undefanged, and nothing goes red. Every
 * assertion below fixes one edge of the narrow version.
 */
import { describe, expect, it } from 'vitest'

import { defangDocument } from './defang.js'
import type { Document, Node } from './model.js'

/** The exfiltration query from the campaign demo, with its real indicators. */
const QUERY = [
  'CommonSecurityLog',
  '| where DestinationIP in ("203.0.113.43", "203.0.113.46")',
  '| where RequestURL startswith "https://mega-sync-store.example/upload"',
]

const documentOf = (nodes: Node[]): Document => ({
  title: 'Case',
  tlp: 'TLP:AMBER',
  language: 'en',
  languageCoverage: 1,
  cover: { eyebrow: '', title: 'Case', subtitle: '', rows: [] },
  sections: [{ blockId: 'b1', kind: 'methods', heading: 'Methods', nodes }],
})

const nodesOut = (nodes: Node[]): Node[] => defangDocument(documentOf(nodes)).sections[0]!.nodes

describe('a method\u2019s query reaches the document byte-exact', () => {
  it('carries every address and scheme through untouched', () => {
    const [out] = nodesOut([{ type: 'code', lines: QUERY, language: 'kql', verbatim: true }])

    expect(out).toEqual({ type: 'code', lines: QUERY, language: 'kql', verbatim: true })
  })

  it('is byte-identical, which is the whole point of the exemption', () => {
    const [out] = nodesOut([{ type: 'code', lines: QUERY, verbatim: true }])

    expect((out as { lines: string[] }).lines.join('\n')).toBe(QUERY.join('\n'))
  })
})

describe('the exemption does not widen', () => {
  /**
   * The defect the narrow implementation exists to prevent: a query pasted
   * into a written section is quoted evidence, and the original argument for
   * defanging applies to it unchanged.
   */
  it('still defangs a code block that does not claim to be verbatim', () => {
    const [out] = nodesOut([{ type: 'code', lines: QUERY, language: 'kql' }])
    const lines = (out as { lines: string[] }).lines

    expect(lines[1]).toContain('203[.]0[.]113[.]43')
    expect(lines[2]).toContain('hxxps://mega-sync-store[.]example')
  })

  it('still defangs a code block whose flag is explicitly false', () => {
    const [out] = nodesOut([{ type: 'code', lines: QUERY, verbatim: false }])

    expect((out as { lines: string[] }).lines[1]).toContain('203[.]0[.]113[.]43')
  })

  /**
   * A result excerpt is quoted telemetry, and the ruling was about a query
   * being runnable. A method's own block draws it as an ordinary code node.
   */
  it('still defangs a pasted result excerpt in the same section', () => {
    const excerpt = ['SourceIP,DestinationIP,Sent', '10.1.2.3,203.0.113.43,4100000000']
    const [, out] = nodesOut([
      { type: 'code', lines: QUERY, verbatim: true },
      { type: 'code', lines: excerpt },
    ])

    expect((out as { lines: string[] }).lines[1]).toContain('203[.]0[.]113[.]43')
  })

  /** A table cell carrying a column name out of a dropped export. */
  it('still defangs a table, which is where a result\u2019s columns land', () => {
    const [out] = nodesOut([
      {
        type: 'table',
        header: ['Method', 'Host'],
        rows: [[{ text: 'M-04' }, { text: 'mega-sync-store.example 203.0.113.43' }]],
        widths: [0.5, 0.5],
      },
    ])
    const rows = (out as { rows: { text: string }[][] }).rows

    expect(rows[0]![1]!.text).toContain('203[.]0[.]113[.]43')
  })

  it('still defangs prose in a methods section', () => {
    const [out] = nodesOut([{ type: 'prose', paras: ['Reached 203.0.113.43 over 443.'] }])

    expect((out as { paras: string[] }).paras[0]).toContain('203[.]0[.]113[.]43')
  })
})
