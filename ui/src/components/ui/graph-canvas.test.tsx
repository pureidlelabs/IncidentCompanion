import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GraphCanvas } from './graph-canvas'

/**
 * The engine arrives through a dynamic import, and a rejected one is silent.
 */
vi.mock('cytoscape', () => {
  throw new Error('the chunk 404s after a deploy')
})

describe('GraphCanvas', () => {
  // A swallowed rejection is a pane that stays empty with nothing said, and a
  // caller with another way to show the same data never learns to offer it.
  it('says so when the engine cannot be loaded', async () => {
    const failed = vi.fn()
    render(<GraphCanvas onFailed={failed} />)
    await waitFor(() => {
      expect(failed).toHaveBeenCalled()
    })
  })

  // The box is still there: the frame around it draws a border and a toolbar,
  // and a caller that unmounts the pane on failure loses those too.
  it('leaves its box in place when the engine fails', async () => {
    const failed = vi.fn()
    const { container } = render(<GraphCanvas onFailed={failed} />)
    await waitFor(() => {
      expect(failed).toHaveBeenCalled()
    })
    expect(container.querySelector('[data-slot="graph-canvas"]')).not.toBeNull()
  })

  // A failure that arrives after the caller has gone is not the caller's to
  // hear: `setState` on an unmounted component is the shape this guards.
  it('stays quiet when it was unmounted before the engine answered', () => {
    const failed = vi.fn()
    const { unmount } = render(<GraphCanvas onFailed={failed} />)
    unmount()
    expect(failed).not.toHaveBeenCalled()
  })
})
