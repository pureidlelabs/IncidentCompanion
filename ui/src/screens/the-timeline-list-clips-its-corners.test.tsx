import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { TimelineScreen } from './timeline'

/**
 * The entry list clips to its own radius, so the day heading cannot paint over
 * the corners the radius removes.
 *
 * **Asserted on the rendered class, not on the source text.** The kit's own
 * pair (`a-table-keeps-its-corner.test.ts`) reads `table.tsx` as a string,
 * which a comment defeats; this asks the element what it carries.
 *
 * jsdom has no geometry, so what the clip *does* is measured elsewhere: the
 * corner hit-test and the walk's `paints-past-the-corner` count, both in the
 * commit that added it. -> #900
 */
describe('the timeline entry list', () => {
  it('clips itself to the radius it draws', () => {
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)

    const list = screen.getByRole('list', { name: 'Timeline entries' })

    expect(
      list.className,
      'the list no longer clips to its radius, so the day heading paints over the ' +
        'corners the border curves away from',
    ).toContain('[clip-path:inset(0_round_var(--radius-sm))]')
  })

  it('still draws the radius it clips to', () => {
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)

    const list = screen.getByRole('list', { name: 'Timeline entries' })

    expect(
      list.className,
      'the clip rounds to a radius the list no longer has, which clips a square box ' +
        'to a curve nothing draws',
    ).toContain('rounded-sm')
  })
})
