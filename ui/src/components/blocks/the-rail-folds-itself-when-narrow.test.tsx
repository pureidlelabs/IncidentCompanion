/**
 * The rail folds itself where it does not fit, and unfolds when asked.
 *
 * **The defect this is written from is geometric and the check is not.** At a
 * 414px viewport the rail held its 240px and did not give way, so the inset
 * kept 174px, the header's controls spilled, and the page scrolled sideways
 * by 42px -- measured by hiding `aside[data-slot="sidebar"]` and watching
 * `documentElement.scrollWidth` drop to the viewport. jsdom cannot see any of
 * that: every element has a zero box and no media query resolves on its own.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Rail } from '@/components/blocks/rail'
import { RailRow } from '@/components/blocks/rail-nav'
import { SidebarMenu } from '@/components/ui/sidebar'

import { AppShell } from './app-shell'

/**
 * The width the shell reads.
 */
function viewportIsNarrow(narrow: boolean) {
  Object.defineProperty(window, 'innerWidth', {
    value: narrow ? 414 : 1440,
    configurable: true,
    writable: true,
  })
}

const rail = (
  <Rail testId="rail" label="Case sections" head={{ name: 'INC-2026-0447', menu: null }}>
    <SidebarMenu>
      <RailRow label="Timeline" to="/timeline" />
    </SidebarMenu>
  </Rail>
)

function draw() {
  return render(
    <MemoryRouter initialEntries={['/timeline']}>
      <AppShell rail={rail} collapsedKey="ic-test-rail" triggerTestId="rail-trigger">
        <p>a pane</p>
      </AppShell>
    </MemoryRouter>,
  )
}

const state = () => screen.getByTestId('rail').getAttribute('data-state')

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the rail folds itself when the viewport is narrow', () => {
  it('opens folded where there is no room for it', () => {
    viewportIsNarrow(true)
    draw()
    expect(state()).toBe('collapsed')
  })

  /**
   * The other half. A rail that folded whatever the viewport said would pass
   * the case above and be wrong everywhere an analyst actually works.
   */
  it('opens unfolded where there is', () => {
    viewportIsNarrow(false)
    draw()
    expect(state()).toBe('expanded')
  })

  /** Folded by default is not folded by decree: the trigger still opens it. */
  it('still unfolds when asked', async () => {
    viewportIsNarrow(true)
    draw()
    await userEvent.click(screen.getByTestId('rail-trigger'))
    expect(state()).toBe('expanded')
  })

  /**
   * And the answer sticks. An analyst who opened the rail on a narrow screen
   * finds it open next time rather than being overruled by the width again.
   */
  it('remembers being unfolded, and does not fold again', () => {
    window.localStorage.setItem('ic-test-rail', 'false')
    viewportIsNarrow(true)
    draw()
    expect(state()).toBe('expanded')
  })
})
