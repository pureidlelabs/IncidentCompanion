import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Calendar } from './calendar'
import { Frame, FrameHeader, FrameTitle } from './frame'

/**
 * A frame's header band is chrome, and chrome is not the page's banner.
 *
 * `header` maps to `role="banner"` unless it descends from `article`, `aside`,
 * `main`, `nav` or `section`. `Frame` is a `div`, so nothing scoped it and
 * every frame on a screen claimed to be the page header. -> #928
 */
const draw = (count: number) =>
  render(
    <>
      {Array.from({ length: count }, (_, i) => (
        <Frame key={i}>
          <FrameHeader>
            <FrameTitle>Frame {i}</FrameTitle>
          </FrameHeader>
        </Frame>
      ))}
    </>,
  )

describe('a frame is not the page banner', () => {
  it('claims no banner for one frame', () => {
    draw(1)
    expect(
      screen.queryAllByRole('banner'),
      'the frame header claims to be the page banner',
    ).toHaveLength(0)
  })

  /**
   * The count is the half a single-frame test cannot see: two banners is both
   * a wrong role and a duplicate of a landmark that may only appear once.
   */
  it('claims no banner for several frames on one screen', () => {
    draw(3)
    expect(screen.queryAllByRole('banner')).toHaveLength(0)
  })

  /** The calendar's month strip is the same shape, one component over. -> #932 */
  it('claims no banner for the calendar month strip', () => {
    render(<Calendar aria-label="Containment date" />)
    expect(screen.queryAllByRole('banner')).toHaveLength(0)
  })
})
