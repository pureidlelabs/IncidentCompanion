/**
 * `useIsMobile` is read on the first render, so seeding it there is the whole
 * behaviour: the sidebar and the date selector pick a layout before any effect
 * has run.
 */
import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { mockMatchMedia } from '@/test/matchMedia'

import { useIsMobile } from './use-mobile'

const WIDE = 1440
const NARROW = 500

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, writable: true, configurable: true })
}

/** Every value the hook has returned, in render order. */
function probe() {
  const seen: boolean[] = []
  function Probe() {
    seen.push(useIsMobile())
    return null
  }
  render(<Probe />)
  return seen
}

afterEach(() => {
  setWidth(WIDE)
})

describe('useIsMobile', () => {
  it('reports a narrow viewport on the first render, before any effect runs', () => {
    setWidth(NARROW)
    expect(probe()[0]).toBe(true)
  })

  it('reports a wide viewport on the first render', () => {
    setWidth(WIDE)
    expect(probe()[0]).toBe(false)
  })

  it('follows the query changing under it', () => {
    setWidth(WIDE)
    const media = mockMatchMedia(false)
    const seen = probe()
    expect(seen.at(-1)).toBe(false)

    setWidth(NARROW)
    act(() => {
      media.fireChange(true)
    })
    expect(seen.at(-1)).toBe(true)
  })
})
