/**
 * **The report's prose is a shared document, and this is the wiring to it.**
 *
 * `report_blocks` carries no body on purpose -- `domain/wire.ts` says so, and
 * `hasProse` is the server answering the question a `body` column used to. The
 * text lives in one CRDT per report, a fragment per block, reached over the
 * case socket. `api/proseSync.ts` names the address in its own docstring
 * (`reports:<id>:document`) and `ProseBody`'s `sync.field` names the fragment
 * ("the block's id, stable across a rename").
 *
 * None of it was connected: the workspace held the text in `useState` seeded
 * from a story prop nothing passed, so every section of every report drew
 * empty while the export carried the words. -> #385
 *
 * **This asks what the screen opens and what each section is given**, which is
 * the whole of the wiring and the only part jsdom can see: there is no
 * `WebSocket` here, so a real channel would never open and the text itself is
 * the browser tier's to assert.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEMO_LAYOUTS, DEMO_TLP } from '@/components/blocks/report-layouts'
import { CaseFrame } from '@/components/blocks/case-frame'
import { EntityCardProvider } from '@/components/blocks/entity-card'
import { DEMO_BLOCKS, DEMO_REPORTS } from '@/components/blocks/report-shape'
import { campaignCase } from '@/fixtures/campaign'

/** Every document the screen asked for, in order. */
const opened: string[] = []
/** What each written section was handed. */
const bodies: { field: string | undefined; readOnly: boolean | undefined }[] = []

vi.mock('@/api/proseSync', () => ({
  useProseSync: (_caseId: string, docKey: string) => {
    opened.push(docKey)
    return {
      channel: docKey === '' ? null : ({ opened: docKey } as never),
      status: 'ready' as const,
      settled: true,
    }
  },
}))

vi.mock('@/components/blocks/prose-body', () => ({
  ProseBody: (props: {
    sync?: { field: string }
    readOnly?: boolean
    label: string
  }) => {
    bodies.push({ field: props.sync?.field, readOnly: props.readOnly })
    return <div data-slot="prose-body" aria-label={props.label} />
  },
}))

const { ReportSectionScreen } = await import('./report-section')

function draw(props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter initialEntries={[`/cases/${campaignCase.id}/report`]}>
      <EntityCardProvider caseId={campaignCase.id}>
        <CaseFrame section="report" caseName={campaignCase.id}>
          <ReportSectionScreen
            reports={DEMO_REPORTS}
            blocks={DEMO_BLOCKS}
            kase={campaignCase}
            layouts={DEMO_LAYOUTS}
            markings={DEMO_TLP}
            caseId={campaignCase.id}
            {...props}
          />
        </CaseFrame>
      </EntityCardProvider>
    </MemoryRouter>,
  )
}

/** Open the first report, which is what puts a workspace on the screen. */
async function openFirstReport(): Promise<{ id: string }> {
  const first = DEMO_REPORTS[0]
  if (first === undefined) throw new Error('no demo report to open')
  draw()
  const subrail = await screen.findByTestId('report-subrail')
  await userEvent.click(within(subrail).getByText(first.label))
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: first.label })).toBeInTheDocument()
  })
  return first
}

describe('the open report`s prose', () => {
  beforeEach(() => {
    opened.length = 0
    bodies.length = 0
  })

  it('opens the report`s own document, not a default one', async () => {
    const first = await openFirstReport()
    expect(
      opened,
      'the screen never asked for the report`s document, so nothing could reach its text',
    ).toContain(`reports:${first.id}:document`)
  })

  it('gives each written section its own fragment, named by the block', async () => {
    const first = await openFirstReport()
    const written = DEMO_BLOCKS.filter(
      (block) => block.reportId === first.id && block.kind === 'written',
    )
    expect(written.length, 'the fixture has no written section to key').toBeGreaterThan(0)

    /**
     * **The block id, not a shared default.** One document holds every section,
     * so bodies sharing a fragment edit each other's text -- which is the
     * failure `ProseBody`'s own `sync.field` docstring is about.
     */
    const fields = bodies.map((one) => one.field)
    for (const block of written) {
      expect(fields, `the section ${block.id} was given no fragment of its own`).toContain(block.id)
    }
    expect(new Set(fields).size, 'two sections share one fragment').toBe(fields.length)
  })
})
