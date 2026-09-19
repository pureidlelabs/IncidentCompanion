import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Plate } from './plate'

/**
 * A plate's radius is the one its content is cut to.
 *
 * A child with its own ground and square corners paints over the arc the
 * radius removes, and every place that met this had answered it differently:
 * `clip-path` twice, `overflow-hidden` once, nothing at the rest. -> #914
 *
 * jsdom resolves no CSS, so these read the classes that would draw it. Whether
 * the paint actually stops at the arc is the browser tier's, through
 * `probe.js`'s `paints-past-the-corner`.
 */
const plateOf = (ui: React.ReactElement) => {
  const { container } = render(ui)
  const found = container.querySelector('[data-part="plate"]')
  if (!(found instanceof HTMLElement)) throw new Error('no plate drawn')
  return found
}

describe('a plate clips its own corner', () => {
  it('declares the corner its content is cut to', () => {
    const className = plateOf(<Plate>content</Plate>).className
    expect(className).toMatch(/\[--plate-corner:/)
    // A plate that declares `0px` while claiming to clip cuts nothing, and
    // reads identical to one that clips at every other assertion here.
    expect(className, 'the plate clips to nothing').not.toContain('[--plate-corner:0px]')
  })

  it('cuts the content rather than the plate, so the border still draws itself', () => {
    const plate = plateOf(<Plate>content</Plate>)
    expect(
      plate.className,
      'the clip is on the plate, so it cuts the border in half at every edge',
    ).not.toContain('clip-path')

    const content = plate.querySelector('[data-part="plate-content"]')
    expect(content?.className).toContain('[clip-path:inset(0_round_var(--plate-corner))]')
  })

  it('takes the corner to zero for a child that has to escape', () => {
    // A sticky head, a focus ring, a menu drawn outside the box: each is a
    // reason the content must not be cut, and the border stays either way.
    const plate = plateOf(<Plate clip={false}>content</Plate>)
    expect(plate.className).toContain('[--plate-corner:0px]')
  })

  it('keeps the radius and the border on the plate itself', () => {
    const plate = plateOf(<Plate>content</Plate>)
    expect(plate.className).toMatch(/\brounded-/)
    expect(plate.className).toMatch(/\bborder\b/)
  })

  it('draws what it is given', () => {
    render(<Plate>the note</Plate>)
    expect(screen.getByText('the note')).toBeInTheDocument()
  })
})
