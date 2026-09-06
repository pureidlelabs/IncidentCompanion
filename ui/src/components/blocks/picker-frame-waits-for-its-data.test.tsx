import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PickerFrame } from './picker-frame'

/**
 * **A pane that is still being read does not draw as if it had been.**
 *
 * The frame routes a refusal through `AsyncBoundary`, and passing
 * `isPending={false}` unconditionally leaves the boundary's pending half
 * unreachable. A container with no way to say a fetch is in flight has two
 * states to offer and both are wrong: the fixture, which is fiction, or an
 * empty list, which tells the analyst the install holds nothing.
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
