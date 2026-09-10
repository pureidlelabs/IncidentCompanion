import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ImportSentinelScreen } from './import-sentinel'

/**
 * The wizard can end by making the case it fills, in one act.
 *
 * **`POST /api/imports/case` creates the case and fills it together**, and it
 * was reached by no screen: the only door created the case first and landed in
 * the importer afterwards, so an analyst who abandoned the wizard left an
 * empty case behind. -> #420
 *
 * Asserted on what the screen *sends*, not on what it draws. A wizard that
 * collects a title and then calls the two-act path looks identical from the
 * outside and leaves the same wreckage.
 */

/** Two rows the server proposed writing, which is what arrives ticked. */
const CANDIDATES = [
  {
    id: 'c1',
    incident: 'i1',
    collection: 'systems',
    label: 'WKS-0142',
    verdict: 'new' as const,
    fields: 6,
    checked: true,
  },
  {
    id: 'c2',
    incident: 'i1',
    collection: 'accounts',
    label: 'r.okonkwo',
    verdict: 'new' as const,
    fields: 4,
    checked: true,
  },
]

function openAtReview(writes: Record<string, unknown>, startsACase = true) {
  return render(
    <ImportSentinelScreen
      phase="review"
      startsACase={startsACase}
      candidates={CANDIDATES}
      selected={['i1']}
      sources={[{ id: 's1', label: 'aurora-soc' }] as never}
      writes={writes as never}
    />,
  )
}

describe('a wizard that starts the case it fills', () => {
  it('asks what the case is called, which the two-act door asked first', () => {
    openAtReview({ create: vi.fn() })
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
  })

  it('says it will create rather than only import', () => {
    openAtReview({ create: vi.fn() })
    expect(screen.getByRole('button', { name: /^Create and import/ })).toBeInTheDocument()
  })

  it('will not create a case with no name', () => {
    openAtReview({ create: vi.fn() })
    expect(screen.getByRole('button', { name: /^Create and import/ })).toBeDisabled()
  })

  it('sends the title and the approved rows to the one-act call', async () => {
    const user = userEvent.setup()
    const create = vi.fn().mockResolvedValue({ caseId: 'case-9' })
    openAtReview({ create })

    // Every candidate arrives ticked -- `ProviderImportReview` reports the
    // approved set on its first draw -- so the analyst's act here is the name.
    await user.type(screen.getByLabelText(/title/i), 'Started from an incident')
    await user.click(screen.getByRole('button', { name: /^Create and import/ }))

    expect(create).toHaveBeenCalledTimes(1)
    const [, , kase] = create.mock.calls[0] as [unknown, unknown, { title: string }]
    expect(kase.title).toBe('Started from an incident')
  })

  /**
   * **Walking away is the common way to leave, not a failure path.** The
   * two-act door wrote the case at the first step, so this is the state that
   * left an empty case behind however cleanly the analyst went.
   */
  it('writes nothing when the analyst leaves before the ending', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ImportSentinelScreen
        asDialog
        phase="review"
        startsACase
        candidates={CANDIDATES}
        selected={['i1']}
        sources={[{ id: 's1', label: 'aurora-soc' }] as never}
        onOpenChange={onOpenChange}
        writes={{ create } as never}
      />,
    )

    await user.type(screen.getByLabelText(/title/i), 'Named, and then abandoned')
    await user.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('leaves the ordinary importer alone', () => {
    // The same screen inside a case that already exists: no title, and the
    // primary writes rows rather than making anything.
    openAtReview({ commit: vi.fn() }, false)
    expect(screen.queryByLabelText(/title/i)).toBeNull()
    expect(screen.getByRole('button', { name: /^Import/ })).toBeInTheDocument()
  })
})
