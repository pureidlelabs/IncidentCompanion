/**
 * The seam a container fills, and the silence available on either side of it.
 *
 * This tier was built as a gallery: `EvidenceScreen` takes a case and keeps
 * every edit in `useState`, which is what makes a story reviewable and what
 * `entity-doors.test.tsx` states as the design. Serving it to an analyst needs
 * the writes to leave the screen instead, and the failure available is the
 * quiet one -- a screen that calls the container *and* keeps mutating its own
 * copy renders exactly right, because its local answer is the one on screen.
 *
 * Written from the attacks on the seam rather than on the writing:
 *
 * - **A supplied `writes` is used, and the local copy is not touched.** A
 *   screen that does both looks correct until a refused write leaves the row
 *   on screen changed and the server holding the other value.
 * - **Every write leaves.** Create, edit, inline commit and delete are four
 *   separate paths through this screen; wiring three and missing one is
 *   invisible, since the missed one still appears to work.
 * - **No `writes` keeps the gallery exactly as it was.** Storybook and the
 *   34 stories depend on it, so the fallback is a promise rather than a
 *   convenience.
 * - **`pendingIds` reaches the table.** It is what greys a row that is in
 *   flight; the screen currently hands `new Set()` unconditionally, so a
 *   container filling it would otherwise be discarded one layer below.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { EvidenceEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { EvidenceScreen, type EvidenceWrites } from './evidence'

/**
 * A spy for each path, so a missed one is named rather than counted.
 *
 * `save` and `commit` resolve with a row, because that is the contract: the
 * screen updates its list from what the server stored, never from what it
 * merged itself.
 */
function spies(): EvidenceWrites {
  const first = campaignCase.evidence[0]
  if (!first) throw new Error('the campaign fixture holds no evidence')
  return {
    save: vi.fn((_entry, fields) => Promise.resolve({ ...first, ...fields, id: 'ev-stored' })),
    patch: vi.fn((ids: readonly string[], fields: Partial<typeof first>) =>
      Promise.resolve(ids.map((id) => ({ ...first, ...fields, id }))),
    ),
    remove: vi.fn(() => Promise.resolve()),
  }
}

/**
 * Renders and waits for the first load.
 *
 * **The register is asynchronous now**, so the first frame has no rows. A test
 * that asserted straight after `render` would be reading the loading state and
 * calling it empty.
 */
async function shown(ui: React.ReactElement) {
  render(ui)
  await screen.findAllByRole('row')
}

/** The one add door. */
function addDoor(): HTMLElement {
  return screen.getByRole('button', { name: /add record/i })
}

/** A record the campaign fixture is known to hold. */
function anExistingRow(): EvidenceEntry {
  const found = campaignCase.evidence[0]
  if (!found) throw new Error('the campaign fixture holds no evidence to edit')
  return found
}

describe('the writes a container supplies', () => {
  /** A write held open, so both sides of the answer can be asserted. */
  function held<T>() {
    let answer!: (value: T) => void
    const promise = new Promise<T>((resolve) => {
      answer = resolve
    })
    return { promise, answer }
  }

  it('waits for the server before showing a new record', async () => {
    const user = userEvent.setup()
    const gate = held<EvidenceEntry>()
    const writes: EvidenceWrites = { ...spies(), save: vi.fn(() => gate.promise) }
    await shown(<EvidenceScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    const before = screen.getAllByRole('row').length
    await user.click(addDoor())
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/name/i), 'mailbox audit export')
    await user.click(within(dialog).getByRole('button', { name: /create|save/i }))

    expect(writes.save).toHaveBeenCalledTimes(1)
    // Unanswered: the case does not hold this record, so the screen does not
    // draw it. A row here would be a claim the screen cannot make.
    expect(screen.getAllByRole('row')).toHaveLength(before)

    gate.answer({ ...anExistingRow(), id: 'ev-stored', name: 'stored by the server' })
    // Answered: the row is the server's rather than a local merge, so the name
    // the server chose is the one on screen and not the one that was typed.
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(before + 1)
    })
    expect(screen.getByText('stored by the server')).toBeInTheDocument()
  })

  it('waits for the server before dropping a deleted record', async () => {
    const user = userEvent.setup()
    const gate = held<undefined>()
    const writes: EvidenceWrites = { ...spies(), remove: vi.fn(() => gate.promise) }
    await shown(<EvidenceScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    const before = screen.getAllByRole('row').length
    const row = anExistingRow()

    await user.click(screen.getAllByRole('button', { name: /delete|remove/i })[0]!)
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: /delete/i }))

    expect(writes.remove).toHaveBeenCalledWith([row.id])
    expect(screen.getAllByRole('row')).toHaveLength(before)

    gate.answer(undefined)
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(before - 1)
    })
  })

  it('keeps the gallery when no writes are given', async () => {
    const user = userEvent.setup()
    await shown(<EvidenceScreen kase={campaignCase} specs={specsFixture} />)

    const before = screen.getAllByRole('row').length

    await user.click(addDoor())
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/name/i), 'a local record')
    await user.click(within(dialog).getByRole('button', { name: /create|save/i }))

    // The gallery answers itself. Storybook is the consumer of this branch.
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(before + 1)
    })
  })

  it('marks a row busy while its write is in flight, and clears it after', async () => {
    const user = userEvent.setup()
    const gate = held<undefined>()
    const writes: EvidenceWrites = { ...spies(), remove: vi.fn(() => gate.promise) }
    await shown(<EvidenceScreen kase={campaignCase} specs={specsFixture} writes={writes} />)

    await user.click(screen.getAllByRole('button', { name: /delete|remove/i })[0]!)
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: /delete/i }))

    /*
     * **A pending row is dimmed and nothing else** -- `data-cell.tsx`
     * carries the whole treatment, and it is opacity. So this asserts the
     * plumbing: a screen that never marked anything busy would look identical
     * here and pass every other test in this file.
     *
     * What it cannot assert is that anybody can tell. Opacity alone is a state
     * carried by appearance, which the accessibility floor refuses, and jsdom
     * gives every element a zero box so no suite here could see it anyway.
     * Recorded rather than fixed: the treatment belongs to the blocks tier.
     */
    const dimmed = () =>
      [...document.querySelectorAll('[data-slot="data-cell"]')].some((cell) =>
        cell.className.includes('opacity'),
      )
    expect(dimmed(), 'no row is marked while a delete is unanswered').toBe(true)

    gate.answer(undefined)
    await waitFor(() => {
      expect(dimmed(), 'a row is still marked after the write finished').toBe(false)
    })
  })
})
