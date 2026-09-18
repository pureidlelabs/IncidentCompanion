import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Slider } from './slider'

/**
 * A size the caller passes is the size the slider takes, lying down or standing.
 *
 * **Asserted on the class list, because the harness cannot see a box.** jsdom
 * gives every element a zero rectangle, so what is readable is whether the
 * component left a rival size in place. A rival prefixed with a variant
 * compiles to an attribute selector and outranks a bare class, which no
 * ordering on the caller's side can undo -- so the test is that no rival
 * survives at all, rather than that the caller's class is present.
 */
describe('a caller can size the slider', () => {
  function classesOf(className: string, orientation?: 'vertical'): string[] {
    // Spread rather than passed: `exactOptionalPropertyTypes` refuses an
    // explicit `undefined` where the prop is optional.
    const standing = orientation === undefined ? {} : { orientation }
    const { container } = render(
      <Slider label="Confidence" defaultValue={60} className={className} {...standing} />,
    )
    const found = container.querySelector('[data-part="slider"]')
    if (!(found instanceof HTMLElement)) throw new Error('the slider root is not in the markup')
    return found.className.split(/\s+/).filter(Boolean)
  }

  /**
   * Every class that sets the same axis, whatever variant it carries.
   *
   * `min-w-*` and `max-w-*` are left out because they are their own groups and
   * a floor beside a width is not a rival. Arbitrary and fractional values are
   * in: `w-[16rem]` and `w-1/2` are the same defect as `w-full` and a check
   * written against the shipped spelling alone would pass over either.
   */
  function rivals(classes: string[], axis: 'w' | 'h', mine: string[]): string[] {
    const sets = new RegExp(String.raw`^(?:[\w.\[\]/%-]+:)*${axis}-`)
    return classes.filter((one) => sets.test(one) && !mine.includes(one))
  }

  it('keeps the width it was given, with nothing of its own beside it', () => {
    const classes = classesOf('w-64')
    expect(classes).toContain('w-64')
    expect(
      rivals(classes, 'w', ['w-64']),
      'the slider carries another width alongside the one it was given',
    ).toEqual([])
  })

  it('keeps the size a standing slider was given', () => {
    const classes = classesOf('h-64 w-24', 'vertical')
    expect(classes).toEqual(expect.arrayContaining(['h-64', 'w-24']))
    expect(rivals(classes, 'h', ['h-64']), 'a rival height survives standing up').toEqual([])
    expect(rivals(classes, 'w', ['w-24']), 'a rival width survives standing up').toEqual([])
  })

  it('still fills its row when the caller asks for no width', () => {
    expect(classesOf('min-w-0')).toContain('w-full')
  })

  it('still stands its own height when the caller asks for none', () => {
    const classes = classesOf('min-w-0', 'vertical')
    expect(classes).toContain('h-40')
    expect(classes).not.toContain('w-full')
  })
})
