/**
 * Whether the entry dialog refuses a bad draft before it writes.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TimelineScreen, type TimelineWrites } from './timeline'
import { BLANK_ACTION, BLANK_EVENT } from './timeline-entries'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

function writesSpy() {
  const save = vi.fn((entry: unknown, fields: Record<string, unknown>, kind: string) =>
    Promise.resolve({
      ...(entry ?? (kind === 'event' ? BLANK_EVENT : BLANK_ACTION)),
      ...fields,
      id: 'new-id',
    }),
  )
  const remove = vi.fn(() => Promise.resolve())
  return { save, remove, asProp: { save, remove } as unknown as TimelineWrites }
}

describe('the new-event door', () => {
  it('refuses an empty description and never calls the write', async () => {
    const user = userEvent.setup()
    const write = writesSpy()
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} writes={write.asProp} />)

    await user.click(screen.getByRole('button', { name: 'New event' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Required.')).toBeVisible()
    expect(write.save).not.toHaveBeenCalled()
  })

  /**
   * The schema trims before it checks length, so three spaces is exactly as
   * empty as nothing at all - a control an analyst could satisfy by holding
   * the space bar down.
   */
  it('refuses a description that is only whitespace', async () => {
    const user = userEvent.setup()
    const write = writesSpy()
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} writes={write.asProp} />)

    await user.click(screen.getByRole('button', { name: 'New event' }))
    await user.type(screen.getByLabelText('Description (title)'), '   ')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Required.')).toBeVisible()
    expect(write.save).not.toHaveBeenCalled()
  })

  it('writes once the description is filled in', async () => {
    const user = userEvent.setup()
    const write = writesSpy()
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} writes={write.asProp} />)

    await user.click(screen.getByRole('button', { name: 'New event' }))
    await user.type(screen.getByLabelText('Description (title)'), 'Suspicious sign-in observed')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(write.save).toHaveBeenCalledTimes(1)
  })
})

describe('the new-activity door', () => {
  it('refuses an empty description and never calls the write', async () => {
    const user = userEvent.setup()
    const write = writesSpy()
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} writes={write.asProp} />)

    await user.click(screen.getByRole('button', { name: 'New activity' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Required.')).toBeVisible()
    expect(write.save).not.toHaveBeenCalled()
  })
})
