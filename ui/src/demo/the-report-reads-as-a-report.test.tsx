/**
 * **The published demo's report says what its sections are called and what is
 * written in them.**
 *
 * A heading key resolves only through `/api/report-layouts`, which the demo
 * refused, and a written section's text is a CRDT nothing seeded - so every
 * section drew as `heading.exec_summary` over an empty field. -> #756, #674
 *
 * The store is a map here: jsdom has no IndexedDB, and what it holds is the
 * socket's half rather than the case's.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DemoState } from './state'

const kept = new Map<string, string>()
vi.mock('./store', () => ({
  loadProse: (field: string) => Promise.resolve(kept.get(field) ?? null),
  saveProse: (field: string, encoded: string) => {
    kept.set(field, encoded)
    return Promise.resolve()
  },
}))

const { headingLabelsByKey } = await import('@/api/reportLayouts')
const { CaseFrame } = await import('@/components/blocks/case-frame')
const { EntityCardProvider } = await import('@/components/blocks/entity-card')
const { ReportSectionScreen } = await import('@/screens/report-section')
const { handle } = await import('./handler')
const { LoopbackSocket, forgetProse, seedLoopback } = await import('./loopback')
const { freshState, seedReportProse } = await import('./state')

let state: DemoState

/** The demo's own report, opened by the address the published build serves. */
function customerRca() {
  const report = state.kase.reports.find((one) => one.label === 'Customer RCA')
  if (report === undefined) throw new Error('the captured case holds no Customer RCA')
  return report
}

async function servedHeadings(): Promise<Record<string, string>> {
  const answer = await handle(state, '/api/report-layouts?lang=en', {})
  expect(answer.status, 'the demo refused the pack every heading is resolved through').toBe(200)
  return headingLabelsByKey((await answer.json()) as never)
}

async function drawTheReport(): Promise<void> {
  const report = customerRca()
  render(
    <MemoryRouter initialEntries={[`/cases/${state.kase.id}/report`]}>
      <EntityCardProvider caseId={state.kase.id}>
        <CaseFrame section="report" caseName={state.kase.id}>
          <ReportSectionScreen
            headings={await servedHeadings()}
            reports={state.kase.reports}
            blocks={state.kase.reportBlocks}
            kase={state.kase}
            caseId={state.kase.id}
            openId={report.id}
            layouts={[]}
            markings={[]}
          />
        </CaseFrame>
      </EntityCardProvider>
    </MemoryRouter>,
  )
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: report.label })).toBeInTheDocument()
  })
}

beforeEach(() => {
  kept.clear()
  forgetProse()
  state = freshState()
  seedLoopback({ seedInto: (doc, field) => { seedReportProse(state, doc, field) } })
  globalThis.WebSocket = LoopbackSocket as unknown as typeof WebSocket
})

describe('the report the published demo opens on', () => {
  it('names every section rather than printing its pack key', async () => {
    await drawTheReport()

    const shown = screen.getAllByRole('heading').map((node) => node.textContent)
    expect(shown.length).toBeGreaterThan(3)
    expect(
      shown.filter((text) => text.startsWith('heading.')),
      'a section drew its own pack key, which is what a visitor reads as the heading',
    ).toEqual([])
  })

  it('draws the words a written section holds', async () => {
    await drawTheReport()

    await waitFor(() => {
      expect(
        screen.getAllByText(/human-operated ransomware incident that spread domain-wide/),
        'every written section was empty, because nothing seeded the report document',
      ).not.toEqual([])
    })
  })
})
