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

/**
 * Every document the screen asked for, in order, and the case it asked in.
 *
 * **Both halves, because the address alone is not the address.** The socket is
 * per case, so a document key handed a blank case reaches nothing -- and a
 * screen that opened `reports:<id>:document` against no case would satisfy
 * every assertion below that only read the key.
 */
const opened: { kase: string; doc: string; who: string | undefined }[] = []
/** What each written section was handed. */
const bodies: {
  field: string | undefined
  readOnly: boolean | undefined
  offers: string[] | undefined
}[] = []

/** Flipped by the case that is about the window before the document answers. */
let settled = true

vi.mock('@/api/proseSync', () => ({
  useProseSync: (caseId: string, docKey: string, presence?: { name: string }) => {
    opened.push({ kase: caseId, doc: docKey, who: presence?.name })
    return {
      channel: docKey === '' || !settled ? null : ({ opened: docKey } as never),
      status: settled ? ('ready' as const) : ('opening' as const),
      settled,
    }
  },
}))

vi.mock('@/components/blocks/prose-body', () => ({
  ProseBody: (props: {
    sync?: { field: string }
    readOnly?: boolean
    label: string
    slashItems?: () => { label: string }[]
  }) => {
    bodies.push({
      field: props.sync?.field,
      readOnly: props.readOnly,
      offers: props.slashItems?.().map((one) => one.label),
    })
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

/** Open a report by label, which is what puts a workspace on the screen. */
async function open(label: string): Promise<void> {
  const subrail = await screen.findByTestId('report-subrail')
  await userEvent.click(within(subrail).getByText(label))
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: label })).toBeInTheDocument()
  })
}

/** The first demo report, which every case below opens unless it says otherwise. */
function firstReport(): { id: string; label: string } {
  const first = DEMO_REPORTS[0]
  if (first === undefined) throw new Error('no demo report to open')
  return first
}

async function openFirstReport(): Promise<{ id: string; label: string }> {
  const first = firstReport()
  draw()
  await open(first.label)
  return first
}

/** The keys the screen asked for, with the idle blanks dropped. */
function asked(): { kase: string; doc: string; who: string | undefined }[] {
  return opened.filter((one) => one.doc !== '')
}

describe("the open report's prose", () => {
  beforeEach(() => {
    opened.length = 0
    bodies.length = 0
    settled = true
  })

  it("opens the report's own document, not a default one", async () => {
    const first = await openFirstReport()
    expect(
      opened,
      "the screen never asked for the report's document, so nothing could reach its text",
    ).toContainEqual({ kase: campaignCase.id, doc: `reports:${first.id}:document` })
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
     *
     * **Distinct fragments, not one entry per render.** `bodies` is pushed to
     * on every render, so counting entries asserts that nothing re-rendered as
     * much as that no two sections share a fragment -- and a correct
     * implementation goes red the first time the workspace draws twice.
     */
    const fields = new Set(bodies.map((one) => one.field))
    for (const block of written) {
      expect([...fields], `the section ${block.id} was given no fragment of its own`).toContain(
        block.id,
      )
    }
    expect(fields.size, 'two sections share one fragment').toBe(written.length)
  })

  /**
   * **What `/` offers, which no other control does.**
   *
   * `ProseBody` registers the insert extension only when it is given the items
   * -- `...(slashItems ? [slash] : [])` -- so a section handed none answers the
   * key with a literal slash, and a table has no other route in: there is no
   * insert control on this screen at all. -> #399
   *
   * **Asserted here because the tier that caught it runs nowhere.** The claim
   * is held in the app by `prose-table.spec.ts`, and no CI job runs any browser
   * spec -- so without this the wiring is protected only by a tier that never
   * executes. -> #89
   */
  it('offers the prose blocks to every written section', async () => {
    await openFirstReport()

    expect(bodies.length, 'the report drew no written section').toBeGreaterThan(0)
    for (const body of bodies) {
      expect(body.offers, `a section was given no blocks to insert`).toBeDefined()
      expect(body.offers, 'the blocks a section offers do not include a table').toContain('Table')
    }
  })

  /**
   * **The report that is open, not the report that is first.**
   *
   * Every case above opens the first one, so a screen keyed on
   * `reports[0].id` satisfies them and draws that report's prose under every
   * other report -- one document read by all of them, which is the whole of
   * what a per-report address prevents.
   */
  it('follows the report the analyst opened', async () => {
    const first = firstReport()
    const second = { ...first, id: 'a-second-report', label: 'The second report' }
    draw({ reports: [first, second] })
    await open(second.label)

    expect(asked().at(-1)?.doc, 'the screen opened a report other than the open one').toBe(
      `reports:${second.id}:document`,
    )
    expect(
      asked().map((one) => one.doc),
      "the first report's document was opened for the second",
    ).not.toContain(`reports:${first.id}:document`)
  })

  /**
   * **Who is typing reaches the channel, not only the screen.**
   *
   * `ReportContainer.test.tsx` proves the name arrives as a prop, and a screen
   * that then joins without it satisfies both files. `api/proseSync` records
   * what that costs: every other analyst draws the caret as `User: 2654252565`,
   * with no warning.
   */
  it("joins under the analyst's name", async () => {
    draw({ analyst: 'Ada Okonjo' })
    await open(firstReport().label)

    expect(asked().at(-1)?.who, 'the document was joined by nobody in particular').toBe(
      'Ada Okonjo',
    )
  })

  /**
   * **No body until the document has answered.**
   *
   * A channel exists from the first render and says whether the server holds
   * anything later. An editor built in between keeps what was typed into it,
   * so the stored section arrives underneath the analyst's own sentence --
   * which reads as the report having gained a paragraph nobody wrote.
   * -> `api/proseSync`
   */
  it('draws no writable body while the document is still opening', async () => {
    settled = false
    draw()
    await open(firstReport().label)

    expect(bodies, 'a body was built before the document said what it holds').toHaveLength(0)
    expect(
      (await screen.findAllByRole('status')).some(
        (one) => one.getAttribute('aria-busy') === 'true',
      ),
      'the section said nothing about waiting, so it read as unwritten',
    ).toBe(true)
  })

  /**
   * **A sent report is read-only, and the fixture has none.**
   *
   * `campaign.test.ts` asserts every demo report has a null `sentAt`, so the
   * frozen case cannot come from the fixture -- and without it an
   * implementation passing `readOnly={false}` draws an editable body on a
   * report that has been filed.
   */
  it("draws a sent report's sections read-only", async () => {
    const sent = { ...firstReport(), sentAt: '2026-03-02T09:00:00.000Z' }
    draw({ reports: [sent] })
    await open(sent.label)

    expect(bodies.length, 'the sent report drew no section at all').toBeGreaterThan(0)
    expect(
      bodies.map((one) => one.readOnly),
      'a filed report offered an editable body',
    ).not.toContain(false)
    /**
     * **And still offered the blocks**, because `slashItems={editable ? ... }`
     * satisfies every other case here and is the wrong shape: what refuses the
     * menu on a read-only body is the editor itself, which computes no match
     * while `isEditable` is false. Withholding the items instead would make
     * the sent report the only place the offer is decided twice.
     */
    for (const body of bodies) {
      expect(body.offers, 'a sent report was given a different set of blocks').toContain('Table')
    }
  })
})
