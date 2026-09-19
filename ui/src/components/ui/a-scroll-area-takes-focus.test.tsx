import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ScrollArea } from './scroll-area'

/**
 * A region that scrolls is reachable by keyboard, or its content is not.
 *
 * Arrow keys move the focused element's nearest scrollable ancestor, so the
 * attribute has to land on the scrolling element itself rather than on a
 * wrapper around it. `role="region"` comes only with a name: an unnamed
 * landmark announces nothing and counts against the ones that do. -> #929
 */
describe('a scroll area takes focus', () => {
  it('is in the tab sequence', () => {
    const { container } = render(<ScrollArea>text</ScrollArea>)
    expect(
      container.querySelector('[data-part="scroll-area"]')?.getAttribute('tabindex'),
      'the region scrolls and no keyboard can reach it',
    ).toBe('0')
  })

  /** A region whose content already focuses does not want a second stop. */
  it('lets a caller take it back out', () => {
    const { container } = render(<ScrollArea tabIndex={-1}>text</ScrollArea>)
    expect(container.querySelector('[data-part="scroll-area"]')?.getAttribute('tabindex')).toBe(
      '-1',
    )
  })

  it('names itself a region only when it is given a name', () => {
    render(<ScrollArea label="Activity">text</ScrollArea>)
    expect(screen.getByRole('region', { name: 'Activity' })).toBeInTheDocument()
  })

  it('claims no region without one', () => {
    render(<ScrollArea>text</ScrollArea>)
    expect(
      screen.queryAllByRole('region'),
      'an unnamed landmark announces nothing and crowds the ones that do',
    ).toHaveLength(0)
  })
})
