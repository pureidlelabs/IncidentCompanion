/**
 * The bulk bar wired onto the evidence register, attacked at the one place a
 * bulk write can go wrong: the ids it sends. A filter written against
 * anything but the row's own id removes or edits its twin instead of the row
 * that was actually ticked.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { EvidenceEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { EvidenceScreen, type EvidenceWrites } from './evidence'

/** Two entries identical in every field but their id, as a run would be. */
function twin(entry: EvidenceEntry, id: string): EvidenceEntry {
  return { ...entry, id }
}

const lead = campaignCase.evidence[0]
if (!lead) throw new Error('the demo case has no evidence')

async function shown(ui: React.ReactElement) {
  render(ui)
  await screen.findAllByRole('row')
}

/** Every row checkbox, in row order, excluding the header's "select all". */
function rowCheckboxes(): HTMLElement[] {
  return screen
    .getAllByRole('checkbox')
    .filter((box) => box.getAttribute('aria-label') !== 'Select every row')
}

describe('bulk delete', () => {
  it('removes exactly the ticked id and leaves its identical twin', async () => {
    const remove = vi.fn((_ids: readonly string[]) => Promise.resolve())
    const writes: EvidenceWrites = {
      save: vi.fn(() => Promise.reject(new Error('not exercised'))),
      patch: vi.fn(() => Promise.resolve([])),
      remove,
    }
    const kase = { ...campaignCase, evidence: [twin(lead, 'twin-a'), twin(lead, 'twin-b')] }
    const user = userEvent.setup()
    await shown(<EvidenceScreen kase={kase} specs={specsFixture} writes={writes} />)

    const before = screen.getAllByRole('row').length
    const boxes = rowCheckboxes()
    expect(boxes).toHaveLength(2)
    await user.click(boxes[0]!)

    await user.click(await screen.findByRole('button', { name: 'Delete 1' }))
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(remove).toHaveBeenCalledTimes(1)
    })
    expect(remove.mock.calls[0]?.[0]).toEqual(['twin-a'])

    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(before - 1)
    })
  })

  it('sends every ticked id and none of the untouched rows, on a delete of more than one', async () => {
    const remove = vi.fn((_ids: readonly string[]) => Promise.resolve())
    const writes: EvidenceWrites = {
      save: vi.fn(() => Promise.reject(new Error('not exercised'))),
      patch: vi.fn(() => Promise.resolve([])),
      remove,
    }
    const kase = {
      ...campaignCase,
      evidence: [
        twin(lead, 'ev-a'),
        twin(lead, 'ev-b'),
        twin(lead, 'ev-c'),
      ],
    }
    const user = userEvent.setup()
    await shown(<EvidenceScreen kase={kase} specs={specsFixture} writes={writes} />)

    const boxes = rowCheckboxes()
    expect(boxes).toHaveLength(3)
    await user.click(boxes[0]!)
    await user.click(boxes[2]!)

    await user.click(await screen.findByRole('button', { name: 'Delete 2' }))
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(remove).toHaveBeenCalledTimes(1)
    })
    expect(new Set(remove.mock.calls[0]?.[0])).toEqual(new Set(['ev-a', 'ev-c']))
  })
})

describe('bulk edit', () => {
  it('patches only the ticked ids with the chosen field, leaving the third row named separately', async () => {
    const patch = vi.fn((ids: readonly string[], fields: Partial<EvidenceEntry>) =>
      Promise.resolve(ids.map((id) => ({ ...lead, ...fields, id }))),
    )
    const writes: EvidenceWrites = {
      save: vi.fn(() => Promise.reject(new Error('not exercised'))),
      patch,
      remove: vi.fn(() => Promise.reject(new Error('not exercised'))),
    }
    const kase = {
      ...campaignCase,
      evidence: [
        { ...lead, id: 'ev-1', name: 'First record', type: 'file' as const },
        { ...lead, id: 'ev-2', name: 'Second record', type: 'file' as const },
        { ...lead, id: 'ev-3', name: 'Third record', type: 'file' as const },
      ],
    }
    const user = userEvent.setup()
    await shown(<EvidenceScreen kase={kase} specs={specsFixture} writes={writes} />)

    await user.click(screen.getByRole('checkbox', { name: 'Select First record' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Second record' }))

    await user.click(await screen.findByRole('button', { name: 'Edit 2' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Type$/ }))
    await user.click(await screen.findByRole('option', { name: 'disk image' }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(patch).toHaveBeenCalledTimes(1)
    })
    expect(new Set(patch.mock.calls[0]?.[0])).toEqual(new Set(['ev-1', 'ev-2']))
    expect(patch.mock.calls[0]?.[1]).toEqual({ type: 'disk image' })
  })
})
