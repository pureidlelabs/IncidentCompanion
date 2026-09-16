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
const { freshState, markWritten, seedReportProse } = await import('./state')

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

    // `getAllByText` throws where nothing matches, which is the assertion: every
    // written section was empty, because nothing seeded the report document.
    await waitFor(() => {
      screen.getAllByText(/human-operated ransomware incident that spread domain-wide/)
    })
  })

  /**
   * **A case written to IndexedDB by an earlier build**, which `load` hands back
   * as it stands: nothing versions the stored document, so the marks the capture
   * answers for are absent and only the call in `install.ts` puts them there.
   */
  it('counts the written sections of a case stored before the words were served', async () => {
    for (const block of state.kase.reportBlocks) {
      delete (block as { hasProse?: boolean }).hasProse
    }
    markWritten(state.kase)

    await drawTheReport()

    expect(
      screen.getByText(/\d+ sections \u00b7 \d+ of \d+ written/).textContent,
      'a stored case read its own prose and still reported none of it written',
    ).toBe('9 sections \u00b7 3 of 3 written')
  })
})
