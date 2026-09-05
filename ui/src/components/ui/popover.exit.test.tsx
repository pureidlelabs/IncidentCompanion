import { render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { DialogTrigger } from 'react-aria-components'
import { describe, expect, it } from 'vitest'

import { Button } from './button'
import { Popover } from './popover'

/** A popover whose open state the test owns, so closing is one call. */
function Harness({ open }: { open: boolean }) {
  const [placement] = useState<'bottom'>('bottom')
  return (
    <DialogTrigger isOpen={open}>
      <Button>Open</Button>
      <Popover isOpen={open} placement={placement}>
        <span>The surface</span>
      </Popover>
    </DialogTrigger>
  )
}

describe('a popover leaves as well as arrives', () => {
  /**
   * **Held on screen while it closes, then gone.**
   *
   * React Aria unmounts an overlay the moment its state closes, and its own
   * detection looks only for a CSS animation - Motion animates in JavaScript,
   * so nothing held the element and the exit was never seen. `isExiting` is
   * what holds it.
   *
   * Both halves are asserted. A hold with no release is a surface that never
   * leaves, so the release is asserted beside the hold.
   */
  it('stays for its exit and then unmounts', async () => {
    const { rerender } = render(<Harness open />)
    expect(screen.getByText('The surface')).toBeInTheDocument()

    rerender(<Harness open={false} />)
    expect(screen.getByText('The surface')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByText('The surface')).not.toBeInTheDocument()
    })
  })
})
