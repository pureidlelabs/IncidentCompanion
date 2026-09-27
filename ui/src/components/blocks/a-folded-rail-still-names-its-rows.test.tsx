import { render, screen } from '@testing-library/react'
import { ShieldAlert } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { RailList, RailRow, RailShell } from '@/components/ui/rail'

/**
 * A folded row is a square glyph, and a glyph is not a name.
 *
 * Folded, everything but the icon is hidden, so whatever named the row while
 * it was open has gone. A tooltip does not replace it: React Aria wires
 * `TooltipTrigger` to `aria-describedby`, which a reader announces after the
 * name rather than as it. -> #926
 *
 * jsdom computes no accessible name, so these read the attribute that would
 * produce one rather than the name itself. What axe sees in a browser is the
 * story tier's; this is the guard that goes red first.
 */
const draw = (folded: boolean) =>
  render(
    <MemoryRouter>
      <RailShell folded={folded}>
        <RailList>
          <RailRow href="/timeline" tooltip="Timeline">
            <ShieldAlert aria-hidden />
            <span>Timeline</span>
          </RailRow>
        </RailList>
      </RailShell>
    </MemoryRouter>,
  )

const row = () => screen.getByRole('link')

describe('a folded rail still names its rows', () => {
  it('names a folded row from its tooltip', () => {
    draw(true)
    expect(
      row().getAttribute('aria-label'),
      'the folded row carries no name, so a reader announces the destination as nothing',
    ).toBe('Timeline')
  })

  /**
   * Open, the visible text is the name already, and a label repeating it would
   * override what the row draws -- the two drift the moment one is edited.
   */
  it('leaves an unfolded row to be named by what it draws', () => {
    draw(false)
    expect(row().getAttribute('aria-label')).toBeNull()
  })

  /** A caller who named the row keeps that name, folded or not. */
  it('keeps a name the caller gave', () => {
    render(
      <MemoryRouter>
        <RailShell folded>
          <RailList>
            <RailRow href="/timeline" tooltip="Timeline" aria-label="The case timeline">
              <ShieldAlert aria-hidden />
            </RailRow>
          </RailList>
        </RailShell>
      </MemoryRouter>,
    )
    expect(row().getAttribute('aria-label')).toBe('The case timeline')
  })
})
