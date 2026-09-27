import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RootError } from './RootError'

// The kit is a plausible thing to have been what threw, and this is the only
// way to put the boundary in that state from outside it.
vi.mock('@/screens/route-error', () => ({
  RootErrorScreen: () => {
    throw new Error('the kit threw as well')
  },
}))

function Throw(): never {
  throw new Error('the tree stopped')
}

describe('when drawing the failure fails too', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('falls back to markup that depends on nothing, rather than unmounting', () => {
    render(
      <RootError>
        <Throw />
      </RootError>,
    )
    expect(screen.getByRole('heading', { name: 'The app stopped rendering' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    // The designed screen folds the stack; reaching the fallback means it did
    // not draw at all, so this is what tells the two apart.
    expect(screen.queryByText('What went wrong')).toBeNull()
    expect(screen.getByText(/the tree stopped/)).toBeInTheDocument()
  })

  it('is still a complaint a sweep can see', () => {
    const { container } = render(
      <RootError>
        <Throw />
      </RootError>,
    )
    expect(container.querySelector('[data-testid="root-error"]')).not.toBeNull()
  })
})
