/**
 * A tab points `aria-controls` at a panel, or at nothing at all.
 *
 * **Two of this project's tab strips have no panel**, deliberately: the entity
 * scope row and the account roster both narrow a table that is a sibling below
 * the list rather than a pane the list switches between. React Aria wires
 * `aria-controls` from the tab to a panel id whichever way the list is used, so
 * without a panel every selected tab names an element that is not in the
 * document -- which axe rates critical, and which is worse than the plain
 * buttons those rows replaced, since a `nav` emitted no such promise.
 *
 * jsdom is the right tier for this: the defect is an attribute and the id it
 * names, and neither needs a box.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Tab, TabList, TabPanel, Tabs } from './tabs'

/** The id a tab claims to control, or null when it claims none. */
function controls(name: string): string | null {
  return screen.getByRole('tab', { name }).getAttribute('aria-controls')
}

describe('a tab list with panels', () => {
  it('points each selected tab at the panel it opens', () => {
    render(
      <Tabs defaultSelectedKey="one">
        <TabList aria-label="With panels">
          <Tab id="one">One</Tab>
          <Tab id="two">Two</Tab>
        </TabList>
        <TabPanel id="one">the first</TabPanel>
        <TabPanel id="two">the second</TabPanel>
      </Tabs>,
    )

    const named = controls('One')
    expect(named, 'the selected tab controls nothing').not.toBeNull()
    expect(
      document.getElementById(named ?? ''),
      'the tab points at an id no element carries',
    ).not.toBeNull()
  })
})

describe('a tab list with no panels', () => {
  /**
   * The shape both callers use: a list that narrows a table drawn beside it.
   */
  function panelless() {
    return render(
      <Tabs defaultSelectedKey="all">
        <TabList aria-label="Scope">
          <Tab id="all">All</Tab>
          <Tab id="some">Some</Tab>
        </TabList>
      </Tabs>,
    )
  }

  it('promises no panel it cannot show', () => {
    panelless()

    // Either spelling is correct; naming an absent id is not.
    for (const name of ['All', 'Some']) {
      const named = controls(name)
      if (named === null) continue
      expect(
        document.getElementById(named),
        `${name} points at "${named}", which is in no document`,
      ).not.toBeNull()
    }
  })

  /** The list still works: the strip is what a reader is left with. */
  it('still marks which tab is selected', () => {
    panelless()

    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Some' })).toHaveAttribute('aria-selected', 'false')
  })
})
