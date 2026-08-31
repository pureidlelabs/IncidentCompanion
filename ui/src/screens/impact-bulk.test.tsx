/**
 * The bulk bar wired onto the impact register, attacked at the one place a
 * bulk write can go wrong: the ids it acts on. A filter written against
 * anything but the row's own id removes or edits its identical twin instead
 * of the row that was actually ticked.
 *
 * This screen keeps every edit in its own `useState` -- there is no
 * container yet -- so the write path under attack is the local filter and
 * map, not a network call.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { ImpactEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { ImpactScreen } from './impact'

/** Two entries identical in every field but their id. */
function twin(entry: ImpactEntry, id: string): ImpactEntry {
  return { ...entry, id }
}

const lead = campaignCase.impact[0]
if (!lead) throw new Error('the demo case has no impact records')

/** Every row checkbox, in row order, excluding the header's "select all". */
function rowCheckboxes(): HTMLElement[] {
  return screen
    .getAllByRole('checkbox')
    .filter((box) => box.getAttribute('aria-label') !== 'Select every row')
}

describe('bulk delete', () => {
  it('removes exactly the ticked id and leaves its identical twin', async () => {
    const kase = { ...campaignCase, impact: [twin(lead, 'twin-a'), twin(lead, 'twin-b')] }
    const user = userEvent.setup()
    render(<ImpactScreen kase={kase} specs={specsFixture} />)

    const before = (await screen.findAllByRole('row')).length
    const boxes = rowCheckboxes()
    expect(boxes).toHaveLength(2)
    await user.click(boxes[0]!)

    await user.click(await screen.findByRole('button', { name: 'Delete 1' }))
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(before - 1)
    })
  })

  it('deletes every ticked row and none of the untouched ones', async () => {
    const kase = {
      ...campaignCase,
      impact: [twin(lead, 'im-a'), twin(lead, 'im-b'), twin(lead, 'im-c')],
    }
    const user = userEvent.setup()
    render(<ImpactScreen kase={kase} specs={specsFixture} />)

    await screen.findAllByRole('row')
    const boxes = rowCheckboxes()
    expect(boxes).toHaveLength(3)
    await user.click(boxes[0]!)
    await user.click(boxes[2]!)

    await user.click(await screen.findByRole('button', { name: 'Delete 2' }))
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(rowCheckboxes()).toHaveLength(1)
    })
  })
})

describe('bulk edit', () => {
  it('patches only the ticked rows, and leaves the third one untouched', async () => {
    const kase = {
      ...campaignCase,
      impact: [
        { ...lead, id: 'im-1', label: 'First record', disposition: 'unknown' as const },
        { ...lead, id: 'im-2', label: 'Second record', disposition: 'unknown' as const },
        { ...lead, id: 'im-3', label: 'Third record', disposition: 'unknown' as const },
      ],
    }
    const user = userEvent.setup()
    render(<ImpactScreen kase={kase} specs={specsFixture} />)

    await screen.findAllByRole('row')
    await user.click(screen.getByRole('checkbox', { name: 'Select First record' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Second record' }))

    await user.click(await screen.findByRole('button', { name: 'Edit 2' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /happened/i }))
    await user.click(await screen.findByRole('option', { name: 'exfiltrated' }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(screen.getAllByText('exfiltrated')).toHaveLength(2)
    })
    const untouchedRow = screen.getByText('Third record').closest('[role="row"]')
    expect(untouchedRow).not.toBeNull()
    expect(within(untouchedRow as HTMLElement).queryByText('exfiltrated')).toBeNull()
  })
})
