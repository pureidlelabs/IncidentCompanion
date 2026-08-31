import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PickerFrame } from './picker-frame'

/**
 * **A pane that is still being read does not draw as if it had been.**
 *
 * The frame already routes a refusal through `AsyncBoundary` and passed
 * `isPending={false}` unconditionally, so the boundary's pending half was
 * unreachable. A container had no way to say a fetch was in flight, and the
 * two states it could offer were both wrong: the fixture, which is fiction,
 * or an empty list, which tells the analyst the install holds nothing.
 *
 * The gallery never saw it because a story has no fetch to be in flight.
 */
describe('the picker frame while its data is being read', () => {
  it('holds the pane back rather than drawing an answer it does not have', () => {
    render(
      <PickerFrame analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} pane="cases" busy>
        <p>Nine cases</p>
      </PickerFrame>,
    )

    expect(screen.queryByText('Nine cases')).toBeNull()
  })

  it('draws the pane once the read has answered', () => {
    render(
      <PickerFrame analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} pane="cases">
        <p>Nine cases</p>
      </PickerFrame>,
    )

    expect(screen.getByText('Nine cases')).toBeInTheDocument()
  })

  it('shows a refusal from a read that has finished and failed', () => {
    // A read is in flight or it has answered; a container never reports both.
    // `AsyncBoundary` returns the wait first, so the pair is left unpinned on
    // purpose rather than given a precedence nothing produces.
    render(
      <PickerFrame analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} pane="cases" problem="The server refused">
        <p>Nine cases</p>
      </PickerFrame>,
    )

    expect(screen.queryByText('Nine cases')).toBeNull()
    expect(screen.getByText(/The server refused/)).toBeInTheDocument()
  })
})
