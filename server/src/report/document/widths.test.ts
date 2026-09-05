/**
 * Every table's widths are fractions of the printable width, and both painters
 * multiply by it.
 */
import { describe, expect, it } from 'vitest'

import { RESOLVERS, resolveReport, type ReportInput } from './resolve.js'
import { english } from './packs.js'
import type { Node, TableNode } from './model.js'
import type { CaseData } from './sections.js'

/**
 * A case with something in every collection, so no resolver returns early.
 */
const CASE: CaseData = {
  id: 'c1',
  title: 'CASE-1',
  customer: 'Acme Corp',
  reference: 'CASE-2026-001',
  analyst: 'An Analyst',
  status: 'open',
  severity: 'high',
  detectionSource: 'EDR alert',
  initialAccessVector: 'Phishing email',
  openedAt: '2026-08-11T10:32:00Z',
  detectedAt: '2026-08-11T10:50:00Z',
  containedAt: '2026-08-11T12:08:00Z',
  timeline: [
    { time: '2026-08-11T10:32:00Z', description: 'Phishing email delivered', technique: 'T1566.001', tactic: 'initial access', systemId: 's1', author: '' },
    { time: '2026-08-11T10:47:00Z', description: 'C2 beacon established', technique: 'T1071.001', tactic: 'command and control', systemId: 's1', author: '' },
    { time: '2026-08-11T10:48:00Z', description: 'C2 beacon established', technique: 'T1071.001', tactic: 'command and control', systemId: 's1', author: '' },
    { time: '2026-08-11T12:02:00Z', description: 'Host isolated', tactic: '', systemId: 's1', author: 'An Analyst' },
  ],
  systems: [{ id: 's1', hostname: 'WKS-1', systemType: 'desktop', zone: 'internal', verdict: 'compromised' }],
  accounts: [{ id: 'a1', accountName: 'j.doe', domain: 'acme.example', privileges: 'standard user' }],
  networkIndicators: [{ id: 'n1', type: 'ipv4', value: '203.0.113.47', port: '443', disposition: 'malicious', context: 'C2 callback' }],
  malware: [{ id: 'm1', filename: 'invoice.exe', hash: 'a3f5', family: 'Downloader', verdict: 'compromised' }],
  cloudApps: [{ appName: 'MailSync', publisher: 'Unknown LLC', verifiedPublisher: 'unverified' }],
  evidence: [{ name: 'EDR export', type: 'system logs', location: 'vault://x', dataClassification: 'Internal' }],
  actions: [{ task: 'Isolate the host', taskType: 'containment', assignee: 'An Analyst', status: 'applied' }],
  impact: [{ label: 'Finance archive', category: 'documents', disposition: 'suspected' }],
  methods: [
    {
      name: 'Proxy sweep',
      established: 'Exfiltration to an external host',
      console: 'Microsoft Sentinel',
      workspace: 'prod-law',
      grammar: 'kql',
      query: 'CommonSecurityLog\n| take 1',
      windowFrom: '2026-08-13T16:00:00.000Z',
      windowTo: '2026-08-13T18:00:00.000Z',
      rowsReturned: 3,
    },
  ],
}

/**
 * **Asserted, not assumed: the fixture reaches every resolver.**
 */
const KINDS_WITH_A_TABLE = [
  'case_header', 'timeline', 'evidence', 'actions', 'entities', 'indicators',
  'metrics', 'root_cause', 'impact', 'glossary', 'technique_table',
  'exec_card', 'killchain', 'narrative', 'methods',
]

function documentFor(kind: string) {
  const input: ReportInput = {
    title: 'CASE-1',
    tlp: 'TLP:AMBER',
    t: english(),
    language: 'en',
    languageCoverage: 1,
    blocks: [{ id: 'b0', kind, heading: '', headingKey: '', position: 0 }],
    caseData: CASE,
  }
  return resolveReport(input)
}

const tablesIn = (nodes: Node[]): TableNode[] =>
  nodes.filter((one): one is TableNode => one.type === 'table')

/** The widest row, since a table's column count is not its header's length. */
const columns = (table: TableNode): number =>
  Math.max(table.header?.length ?? 0, ...table.rows.map((row) => row.length))

describe('the width convention every painter multiplies out', () => {
  for (const kind of Object.keys(RESOLVERS)) {
    it(`${kind} declares widths that fill the page exactly once`, () => {
      const tables = tablesIn(documentFor(kind).sections[0]!.nodes)

      // The guard against a fixture that stopped reaching this resolver: an
      // empty state produces prose, and prose has no widths to be wrong.
      if (KINDS_WITH_A_TABLE.includes(kind)) expect(tables.length).toBeGreaterThan(0)

      for (const table of tables) {
        const total = table.widths.reduce((sum, share) => sum + share, 0)
        // Not `toBeCloseTo(1)`: the failure this exists for is 3x and 19x, and
        // a tolerance loose enough to allow rounding is nowhere near either.
        expect(total, `${kind} widths ${JSON.stringify(table.widths)} sum to ${String(total)}`)
          .toBeGreaterThan(0.98)
        expect(total).toBeLessThan(1.02)
        expect(table.widths).toHaveLength(columns(table))
      }
    })
  }
})
