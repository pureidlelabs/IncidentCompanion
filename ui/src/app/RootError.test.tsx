import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RootError } from './RootError'

function Throw(): never {
  throw new Error('the tree stopped')
}

describe('the last boundary', () => {
  beforeEach(() => {
    // React prints the caught error, and componentDidCatch prints it again.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('passes its children through while nothing has thrown', () => {
    render(
      <RootError>
        <p>the app</p>
      </RootError>,
    )
    expect(screen.getByText('the app')).toBeInTheDocument()
  })

  it('draws the designed screen rather than markup of its own', () => {
    render(
      <RootError>
        <Throw />
      </RootError>,
    )
    expect(screen.getByRole('heading', { name: 'The app stopped rendering' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('paints nothing by hand, so the crash screen is themed like the rest', () => {
    const { container } = render(
      <RootError>
        <Throw />
      </RootError>,
    )
    // A custom property is how the kit plumbs a token through, so it is not
    // hand-painting; a literal colour or length is.
    const painted = [...container.querySelectorAll('[style]')].flatMap((one) =>
      [...(one as HTMLElement).style].filter((property) => !property.startsWith('--')),
    )
    expect(painted, 'the last boundary is drawn by the kit, not painted by hand').toEqual([])
  })

  it('says what was thrown even when it was not an Error', () => {
    function ThrowAString(): never {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'a bare string'
    }
    render(
      <RootError>
        <ThrowAString />
      </RootError>,
    )
    expect(screen.getByText(/a bare string/)).toBeInTheDocument()
  })

  it('draws the failure when the thrown value is falsy', () => {
    function ThrowNull(): never {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw null
    }
    render(
      <RootError>
        <ThrowNull />
      </RootError>,
    )
    expect(screen.getByRole('heading', { name: 'The app stopped rendering' })).toBeInTheDocument()
  })

  it('folds the detail away rather than opening on a stack trace', () => {
    render(
      <RootError>
        <Throw />
      </RootError>,
    )
    const detail = screen.getByText('What went wrong').closest('details')
    expect(detail, 'the stack is drawn, but not as the first thing on screen').not.toBeNull()
    expect(detail?.open, 'the fold starts closed').toBe(false)
    expect(screen.getByText(/the tree stopped/)).toBeInTheDocument()
  })
})
