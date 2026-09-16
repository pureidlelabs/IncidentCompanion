/**
 * The select-all caption on the timeline. Both assertions go through the
 * caption rather than the box, because a test driving the box passes whether
 * or not the words are wired to anything.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { TimelineScreen } from './timeline'

const caption = `Select all ${String(campaignCase.timeline.length)} shown`

describe('the timeline select-all caption', () => {
  it('is the box name, not text standing next to it', () => {
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)
    expect(screen.getByLabelText(caption)).toBe(
      screen.getByRole('checkbox', { name: caption }),
    )
  })

  it('ticks every row when the words are pressed', async () => {
    const user = userEvent.setup()
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)

    await user.click(screen.getByText(caption))

    expect(screen.getByRole('checkbox', { name: caption })).toBeChecked()
    expect(
      screen.getByText(`${String(campaignCase.timeline.length)} selected`),
    ).toBeVisible()
  })
})
