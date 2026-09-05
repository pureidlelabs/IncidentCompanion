/**
 * The seam a container fills, and the silence available on either side of it.
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
    // Unanswered: the dialog is still open over the table, holding the draft
    // until the server says whether it took it. The rows behind a modal are
    // out of the accessibility tree, so what is readable here is the dialog.
    expect(screen.getByRole('dialog')).toBeInTheDocument()

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
