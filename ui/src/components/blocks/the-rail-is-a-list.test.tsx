import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { CaseFrame } from './case-frame'

/**
 * Every rail row is a list item its list contains.
 *
 * A row rendered inside a wrapper is still an `<li>`, and it still draws
 * correctly -- what it stops being is part of a list. Both of axe's rules fire
 * together on that shape, `listitem` on the row and `list` on the `<ul>` that
 * now holds a `<div>`, and a screen reader stops saying how many rows there
 * are.
 *
 * Asserted structurally rather than through axe: the story tier runs axe with
 * `a11y: { test: 'todo' }` and fails on nothing, so a rule firing there is not
 * a gate. -> #917, #916
 */
/**
 * Both levels, because the rail nests.
 *
 * Scoped to `rail-item` and `rail-list` alone, these read half the rail: the
 * frame draws a sub-list under the Report row, and the same fault there would
 * pass green.
 */
const ROWS = 'li[data-part="rail-item"], li[data-part="rail-subitem"]'
const LISTS = 'ul[data-part="rail-list"], ul[data-part="rail-sublist"]'

function rail() {
  const { container } = render(
    <MemoryRouter initialEntries={['/cases/one/report']}>
      <CaseFrame section="report" caseName="one">
        <div>a section</div>
      </CaseFrame>
    </MemoryRouter>,
  )
  return container
}

describe('the rail the frame draws', () => {
  it('draws both levels, so the two assertions below are over something', () => {
    const drawn = rail()
    const rows = drawn.querySelectorAll(ROWS).length
    const sub = drawn.querySelectorAll('li[data-part="rail-subitem"]').length

    expect(rows, 'the rail drew no rows, so the checks below pass over nothing').toBeGreaterThan(10)
    expect(sub, 'the rail drew no sub-rows, so the nested half is unchecked').toBeGreaterThan(0)
  })

  it('puts every row in the list that holds it', () => {
    const orphans = [...rail().querySelectorAll(ROWS)]
      .filter((row) => {
        const holder = row.parentElement
        return holder === null || !['UL', 'OL'].includes(holder.tagName)
      })
      .map((row) => row.textContent.trim().slice(0, 30))

    expect(
      orphans,
      'these rows are list items outside any list, so the rail is markup that looks ' +
        'like a list and is not one',
    ).toEqual([])
  })

  it('puts nothing but rows directly in the list', () => {
    const strays = [...rail().querySelectorAll(LISTS)]
      .flatMap((list) => [...list.children])
      .filter((child) => child.tagName !== 'LI')
      .map((child) => child.tagName.toLowerCase())

    expect(
      strays,
      'a list holding anything but list items is the other half of the same fault, ' +
        'and axe reports it separately',
    ).toEqual([])
  })
})
