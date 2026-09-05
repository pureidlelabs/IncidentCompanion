import { render, screen } from '@testing-library/react'
import { ShieldAlert } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'

import { Rail, type RailHead } from './rail'

/**
 * **What the rail owes once it draws its own head and foot.**
 */
const draw = (ui: React.ReactNode) => render(<SidebarProvider>{ui}</SidebarProvider>)

const HEAD: RailHead = {
  icon: ShieldAlert,
  name: 'INC-2026-0447',
  caption: 'Major campaign',
  menu: <span>switch</span>,
}

describe('the rail binds its three parts', () => {
  /**
   * **A rail with no analyst at its foot must not draw the band anyway.**
   */
  it('draws no footer band for a caller that passed no analyst', () => {
    draw(
      <Rail testId="rail" label="Case sections" head={HEAD}>
        <div>rows</div>
      </Rail>,
    )
    expect(screen.queryByTestId('rail-footer')).toBeNull()
    expect(screen.queryByTestId('rail-user')).toBeNull()
  })

  /** Given an analyst, the band is drawn and it is `RailUser` that fills it. */
  it('draws the analyst the caller named, inside the footer band', () => {
    draw(
      <Rail
        testId="rail"
        label="Case sections"
        head={HEAD}
        user={{
          person: { name: 'analyst@example.test', you: true },
          caption: 'Analyst',
          menu: <span>sign out</span>,
        }}
      >
        <div>rows</div>
      </Rail>,
    )
    const footer = screen.getByTestId('rail-footer')
    expect(footer.textContent).toContain('analyst@example.test')
    expect(footer.querySelector('[data-testid="rail-user"]')).not.toBeNull()
  })

  /**
   * **The head is the rail's, not the caller's.**
   */
  it('draws its own head from the data it is given', () => {
    draw(
      <Rail testId="rail" label="Case sections" head={HEAD}>
        <div>rows</div>
      </Rail>,
    )
    const header = screen.getByTestId('rail-header')
    expect(header.textContent).toContain('INC-2026-0447')
    expect(header.textContent).toContain('Major campaign')
    expect(header.getAttribute('aria-label')).toBe('INC-2026-0447. Switch')
  })

  /**
   * **The status rides the head, and only when there is one.**
   *
   * A badge rendered for an absent status is an empty chip beside the case
   * name; jsdom cannot see that it is empty, so the assertion is on the element
   * not existing at all.
   */
  it('draws no status badge where the caller named no status', () => {
    draw(
      <Rail testId="rail" label="Case sections" head={HEAD}>
        <div>rows</div>
      </Rail>,
    )
    expect(screen.queryByTestId('rail-header-status')).toBeNull()
    expect(screen.getByTestId('rail-header').getAttribute('aria-label')).toBe(
      'INC-2026-0447. Switch',
    )
  })

  /** Given one, it sits in the head beside the name - never in the foot. */
  it('puts the status in the head beside the name', () => {
    draw(
      <Rail testId="rail" label="Case sections" head={{ ...HEAD, status: 'Open' }}>
        <div>rows</div>
      </Rail>,
    )
    const badge = screen.getByTestId('rail-header-status')
    expect(badge.textContent).toBe('Open')
    expect(screen.getByTestId('rail-header').contains(badge)).toBe(true)
    // The badge is not drawn while the rail is folded, so the state has to
    // survive in the accessible name as well.
    expect(screen.getByTestId('rail-header').getAttribute('aria-label')).toBe(
      'INC-2026-0447, Open. Switch',
    )
  })

  it('puts its head above its rows and its foot below them', () => {
    const { container } = draw(
      <Rail
        testId="rail"
        label="Case sections"
        head={HEAD}
        user={{ person: { name: 'analyst@example.test' }, menu: <span>menu</span> }}
      >
        <span>rows</span>
      </Rail>,
    )
    const bands = [...container.querySelectorAll('[data-slot]')]
      .map((one) => one.getAttribute('data-slot'))
      .filter((slot) => slot !== null && /^sidebar-(header|content|footer)$/.test(slot))
    expect(bands).toEqual(['sidebar-header', 'sidebar-content', 'sidebar-footer'])
  })

  /**
   * **One label, two elements.**
   */
  it('names both the rail and its list of destinations', () => {
    const { container } = draw(
      <Rail testId="rail" label="Case sections" head={HEAD}>
        <div>rows</div>
      </Rail>,
    )
    expect(container.querySelector('[data-slot="sidebar"]')?.getAttribute('aria-label')).toBe(
      'Case sections',
    )
    expect(
      container.querySelector('[data-slot="sidebar-content"]')?.getAttribute('aria-label'),
    ).toBe('Case sections')
  })

  /**
   * The handle is the rail's own, because a page has more than one rail across
   * its screens and a suite looks each of them up by name.
   */
  it('hands its test id to the rail itself, not to a band inside it', () => {
    draw(
      <Rail testId="picker-rail" label="Picker" head={HEAD}>
        <div>rows</div>
      </Rail>,
    )
    expect(screen.getByTestId('picker-rail').getAttribute('data-slot')).toBe('sidebar')
  })
})
