/**
 * What the methods appendix prints, attacked rather than demonstrated.
 *
 * The rows here are shaped from `domain/entities/method.ts` rather than from
 * what this resolver wants to read - a fixture written from the reader proves
 * the sort is stable and cannot prove the columns exist.
 *
 * **The four attacks the brief named, and where each lands:**
 * a window that says nothing (below); a query carrying a quote (below); a
 * method deleted while things reference it (`collections/reference-check`);
 * a method in another case (`collections/reference-check`).
 */
import { describe, expect, it } from 'vitest'

import { methods } from './sections.js'
import { EN } from './labels.en.js'
import type { Node } from './model.js'
import type { ReportInput } from './resolve.js'

const t = (key: string): string => EN[key] ?? key

const inputOf = (rows: Record<string, unknown>[]): ReportInput =>
  ({
    title: 'Case',
    tlp: 'amber',
    language: 'en',
    t,
    languageCoverage: 1,
    blocks: [],
    caseData: { id: 'c1', title: 'Case', methods: rows },
  })

const FULL = {
  name: 'Sentinel proxy sweep',
  kind: 'siem query',
  established: 'Exfiltration of three archives to an external sync host',
  console: 'Microsoft Sentinel',
  workspace: 'meridian-prod-law',
  runBy: 'D. Okonkwo',
  runAt: '2026-08-13T19:04:00.000Z',
  grammar: 'kql',
  query: 'CommonSecurityLog\n| where RequestURL has "mega-sync-store.example"',
  windowFrom: '2026-08-13T16:00:00.000Z',
  windowTo: '2026-08-13T18:00:00.000Z',
  rowsReturned: 3,
  resultColumns: 'SourceIP;DestinationHostName;Sent',
  resultExcerpt: '',
}

const textIn = (nodes: Node[]): string => JSON.stringify(nodes)

const codeNodes = (nodes: Node[]) => nodes.filter((n): n is Node & { type: 'code' } => n.type === 'code')

describe('an empty register', () => {
  it('says so rather than drawing an empty table', () => {
    const nodes = methods(inputOf([]))

    expect(nodes).toEqual([{ type: 'prose', paras: ['No methods recorded.'] }])
  })
})

describe('the summary table', () => {
  it('numbers by position and never stores the number', () => {
    const nodes = methods(inputOf([FULL, { ...FULL, name: 'Second' }]))
    const table = nodes[0] as { rows: { text: string }[][] }

    expect(table.rows.map((row) => row[0]!.text)).toEqual(['M-1', 'M-2'])
  })

  it('prints the window as an absolute range, not the query text', () => {
    const table = methods(inputOf([FULL]))[0] as { rows: { text: string }[][] }

    expect(table.rows[0]![2]!.text).toContain('2026-08-13 16:00 \u2192 2026-08-13 18:00 UTC')
  })
})

describe('a window that says nothing', () => {
  /**
   * *Capture is never refused*, so an unstated window is visible work. The
   * failure to attack is a blank cell, which reads as a column that failed to
   * render rather than as a fact nobody stated.
   */
  it('names the absence rather than leaving the cell blank', () => {
    const table = methods(inputOf([{ ...FULL, windowFrom: null, windowTo: null }]))[0] as {
      rows: { text: string }[][]
    }

    expect(table.rows[0]![2]!.text).toContain('Not stated')
    expect(table.rows[0]![2]!.text).not.toBe('')
  })

  it('prints a half-stated window rather than discarding the half it has', () => {
    const table = methods(inputOf([{ ...FULL, windowTo: null }]))[0] as {
      rows: { text: string }[][]
    }

    expect(table.rows[0]![2]!.text).toContain('2026-08-13 16:00')
  })
})

describe('the row count, and the two ways it can be absent', () => {
  /** The one that is easiest to get wrong: `0` is an answer, `null` is not. */
  it('prints zero as a result rather than as nothing stated', () => {
    const nodes = methods(inputOf([{ ...FULL, rowsReturned: 0 }]))
    const table = nodes[0] as { rows: { text: string }[][] }

    expect(table.rows[0]![3]!.text).toBe('0')
    expect(textIn(nodes)).toContain('0 rows returned, as recorded by the analyst')
  })

  it('says a count is unstated when it is null', () => {
    const nodes = methods(inputOf([{ ...FULL, rowsReturned: null }]))
    const table = nodes[0] as { rows: { text: string }[][] }

    expect(table.rows[0]![3]!.text).toBe('Not stated')
    expect(textIn(nodes)).toContain('Rows returned not stated')
  })

  /**
   * The app never ran the query. A bare figure lets a regulator read a typed
   * number as a measured one, which is the whole reason the label is long.
   */
  it('never prints a count without saying whose number it is', () => {
    const nodes = methods(inputOf([FULL]))

    expect(textIn(nodes)).toContain('as recorded by the analyst')
  })
})

describe('the query itself', () => {
  it('is a code node claiming verbatim, which is what carries it past defang', () => {
    const [code] = codeNodes(methods(inputOf([FULL])))

    expect(code).toMatchObject({ language: 'kql', verbatim: true })
  })

  it('keeps every line the analyst wrote', () => {
    const [code] = codeNodes(methods(inputOf([FULL])))

    expect((code as unknown as { lines: string[] }).lines).toEqual([
      'CommonSecurityLog',
      '| where RequestURL has "mega-sync-store.example"',
    ])
  })

  /** A KQL string literal is quoted; an analyst's own apostrophe is not rare either. */
  it('carries a quote and an apostrophe through untouched', () => {
    const query = `| where Account == 'CORP\\\\o'brien' and Cmd has "a\\"b"`
    const [code] = codeNodes(methods(inputOf([{ ...FULL, query }])))

    expect((code as unknown as { lines: string[] }).lines).toEqual([query])
  })

  it('declares no language when the analyst stated no grammar', () => {
    const [code] = codeNodes(methods(inputOf([{ ...FULL, grammar: '' }])))

    expect(code).not.toHaveProperty('language')
  })

  it('draws no code node at all for a method with no query', () => {
    const nodes = methods(inputOf([{ ...FULL, query: '' }]))

    expect(codeNodes(nodes)).toEqual([])
  })
})

describe('a recorded result', () => {
  /**
   * The exemption is the query's alone. A transcript or a pasted export is
   * quoted telemetry, so it must reach `defangNode` as an ordinary code node.
   */
  it('is a code node that does NOT claim verbatim', () => {
    const nodes = methods(inputOf([{ ...FULL, resultExcerpt: 'SourceIP\n203.0.113.43' }]))
    const [query, excerpt] = codeNodes(nodes)

    expect(query).toMatchObject({ verbatim: true })
    expect(excerpt).not.toHaveProperty('verbatim')
  })

  it('is left out entirely when nobody pasted one', () => {
    expect(codeNodes(methods(inputOf([FULL])))).toHaveLength(1)
  })
})

describe('every label the resolver asks for exists', () => {
  /**
   * A missing key falls through to the key itself, which renders as
   * `column.method_ref` in a customer's Word document and no test would see it.
   */
  it('resolves every key against the English pack', () => {
    const printed = textIn(methods(inputOf([{ ...FULL, rowsReturned: null }])))

    for (const key of ['column.', 'field.', 'value.', 'empty.', 'heading.']) {
      expect(printed).not.toContain(key)
    }
  })

  it('gives the block a heading key', () => {
    expect(EN['heading.methods']).toBe('Methods')
  })
})
