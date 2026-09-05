import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { Rail } from '@/components/blocks/rail'
import { RailRow } from '@/components/blocks/rail-nav'
import { SidebarMenu } from '@/components/ui/sidebar'

import { AppShell } from './app-shell'

/**
 * **The shell takes one rail, and the rail has to be inside its provider.**
 */
const rail = (
  <Rail testId="rail" label="Case sections" head={{ name: 'INC-2026-0447', menu: null }}>
    <SidebarMenu>
      <RailRow label="Timeline" to="/timeline" />
    </SidebarMenu>
  </Rail>
)

function draw(node: React.ReactNode) {
  return render(<MemoryRouter initialEntries={['/timeline']}>{node}</MemoryRouter>)
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('the shell folds the rail it is handed', () => {
  /**
   * **A rail rendered outside the provider reads as permanently unfolded**, and
   * renders perfectly while doing it. The row is the tell: `RailRow` drops its
   * label when the rail is folded, so a shell whose rail cannot see the fold
   * state draws a folded rail with every word still in it.
   */
  it('folds the rail, and the rows inside it, from the persisted flag', () => {
    window.localStorage.setItem('case-rail', 'true')
    draw(
      <AppShell collapsedKey="case-rail" triggerTestId="rail-trigger" rail={rail}>
        <p>pane</p>
      </AppShell>,
    )
    expect(screen.getByTestId('rail').getAttribute('data-state')).toBe('collapsed')
    expect(screen.queryByText('Timeline')).toBeNull()
  })

  it('leaves the rail unfolded, and its rows worded, when the flag is not set', () => {
    draw(
      <AppShell collapsedKey="case-rail" triggerTestId="rail-trigger" rail={rail}>
        <p>pane</p>
      </AppShell>,
    )
    expect(screen.getByTestId('rail').getAttribute('data-state')).toBe('expanded')
    expect(screen.getByText('Timeline')).toBeTruthy()
  })

  /**
   * The fold an analyst sets is theirs on the next load, under the key the
   * screen named rather than a key the shell invented.
   */
  it('writes the fold under the key it was given', async () => {
    draw(
      <AppShell collapsedKey="picker-rail" triggerTestId="rail-trigger" rail={rail}>
        <p>pane</p>
      </AppShell>,
    )
    await userEvent.click(screen.getByTestId('rail-trigger'))
    expect(window.localStorage.getItem('picker-rail')).toBe('true')
  })
})

/** Holds a number nothing outside it can reset, so a remount is visible. */
function Counted() {
  const [seen] = useState(() => Math.random())
  return <span data-testid="pane-life">{String(seen)}</span>
}

describe('the pane resets its scroll between screens', () => {
  /**
   * **A new section is a new list, and a scroller carrying the last one's offset
   * opens part-way down it.**
   */
  it('remounts the pane when paneKey changes', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/timeline']}>
        <AppShell collapsedKey="case-rail" triggerTestId="t" rail={rail} paneKey="timeline">
          <Counted />
        </AppShell>
      </MemoryRouter>,
    )
    const before = screen.getByTestId('pane-life').textContent
    rerender(
      <MemoryRouter initialEntries={['/timeline']}>
        <AppShell collapsedKey="case-rail" triggerTestId="t" rail={rail} paneKey="evidence">
          <Counted />
        </AppShell>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('pane-life').textContent).not.toBe(before)
  })

  it('keeps the pane when paneKey does not change', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/timeline']}>
        <AppShell collapsedKey="case-rail" triggerTestId="t" rail={rail} paneKey="timeline">
          <Counted />
        </AppShell>
      </MemoryRouter>,
    )
    const before = screen.getByTestId('pane-life').textContent
    rerender(
      <MemoryRouter initialEntries={['/timeline']}>
        <AppShell collapsedKey="case-rail" triggerTestId="t" rail={rail} paneKey="timeline">
          <Counted />
        </AppShell>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('pane-life').textContent).toBe(before)
  })
})
