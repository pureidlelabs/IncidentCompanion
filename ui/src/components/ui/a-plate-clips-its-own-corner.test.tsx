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
  it('cuts inside the stroke rather than across it', () => {
    // The whole expression, not a prefix: dropping the `-1px` clips at the
    // outer arc, so the content's ground covers the border it sits inside --
    // which is the defect this component exists to answer, one pixel smaller.
    expect(plateOf(<Plate>content</Plate>).className).toContain(
      '[--plate-corner:calc(var(--plate-radius)-1px)]',
    )
  })

  it.each([
    ['sm', 'rounded-sm'],
    ['md', 'rounded-md'],
    ['lg', 'rounded-lg'],
  ] as const)('pairs the %s radius with the token the cut reads', (radius, rounded) => {
    // The arc the border draws and the arc the content is cut to come from
    // two classes. Paired wrongly, or with the token missing, `calc` fails to
    // substitute, `clip-path` computes to `none`, and the cut is gone with no
    // class changing.
    const className = plateOf(<Plate radius={radius}>content</Plate>).className
    expect(className).toContain(rounded)
    expect(className).toContain(`[--plate-radius:var(--radius-${radius})]`)
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

  it('drops the cut entirely for a child that has to escape', () => {
    // Not a zeroed corner: `inset(0px round 0px)` is still a clip to the
    // border box and still opens a stacking context, so it cuts everything a
    // real corner does. The box and its border stay either way.
    const plate = plateOf(<Plate clip={false}>content</Plate>)
    const content = plate.querySelector('[data-part="plate-content"]')
    expect(content?.className, 'the escape hatch still cuts').not.toContain('clip-path')
  })

  it('keeps the radius and the border on the plate itself', () => {
    const plate = plateOf(<Plate>content</Plate>)
    // Whole classes: `/\bborder\b/` matches inside `border-border`, so a
    // plate with `border-0` passed that assertion with no border at all.
    const classes = plate.className.split(/\s+/)
    expect(classes).toContain('border')
    expect(classes.some((one) => /^rounded-(sm|md|lg)$/.test(one))).toBe(true)
  })

  it('draws what it is given', () => {
    render(<Plate>the note</Plate>)
    expect(screen.getByText('the note')).toBeInTheDocument()
  })
})
