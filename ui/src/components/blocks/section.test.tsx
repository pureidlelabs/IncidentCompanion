import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Section } from './section'

/**
 * Which of a section's slots reach the DOM, and how many headings it emits.
 *
 * The arrangement half of `fills` and `measure` is geometry, so it is asserted
 * in `section-layout.stories.tsx`, where a real browser resolves an
 * overflow and a `max-width` token. jsdom gives every element a zero box, so a
 * scroller here would pass over nothing.
 *
 * What jsdom can decide is presence: a footer slot that draws an element when
 * nothing was passed costs the section a gap and a border it never asked for.
 */

describe('the footer slot', () => {
  it('draws nothing when no footer is passed', () => {
    const { container } = render(<Section title="Systems">rows</Section>)
    const section = container.querySelector('[data-slot="section"]')
    expect(section).not.toBeNull()
    // The body is the last child, so nothing sits under it taking a gap.
    expect(section?.lastElementChild?.getAttribute('data-slot')).toBe('section-body')
  })

  it('draws the footer when one is passed', () => {
    const { container } = render(
      <Section title="Systems" footer={<span>Page 1 of 3</span>}>
        rows
      </Section>,
    )
    const section = container.querySelector('[data-slot="section"]')
    expect(section?.lastElementChild?.getAttribute('data-slot')).not.toBe('section-body')
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
  })
})

describe('the head', () => {
  it('emits exactly one h1, which is the section title', () => {
    render(
      <Section title="Systems" blurb="What the intrusion touched.">
        rows
      </Section>,
    )
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Systems')
  })

  /**
   * Characterisation, not a guard: `Section` emits an unguarded `h1`.
   *
   * This records what the layout does today so the decision is made
   * deliberately rather than discovered. It goes red when somebody *fixes* the
   * heading level, and is deleted at that point: it does not protect the
   * behaviour it pins.
   *
   * The decision is the maintainer's because it is about the workspace's heading
   * hierarchy rather than about this file: `CaseShell.tsx` already renders an
   * `h1` for the case title, and `sections.tsx` already carries a `hideTitle`
   * rule for panes whose heading would repeat. Nothing outside `layouts/`
   * mounts `Section` yet, so the second `h1` is imminent rather than
   * shipped, and giving the level a prop here would pick the hierarchy for
   * three screens that do not exist.
   */
  it('emits an unguarded h1, so two stacked sections give a screen two', () => {
    render(
      <>
        <Section title="Systems">rows</Section>
        <Section title="Accounts">rows</Section>
      </>,
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(2)
  })
})

describe('the optional head slots', () => {
  it('draws no blurb paragraph when none is passed', () => {
    const { container } = render(<Section title="Systems">rows</Section>)
    expect(container.querySelector('[data-slot="section-head"] p')).toBeNull()
  })

  it('puts the toolbar between the head and the body', () => {
    const { container } = render(
      <Section title="Systems" toolbar={<span data-testid="filters">filters</span>}>
        rows
      </Section>,
    )
    const slots = [...(container.querySelector('[data-slot="section"]')?.children ?? [])].map(
      (child) => child.getAttribute('data-slot') ?? child.getAttribute('data-testid'),
    )
    expect(slots).toEqual(['section-head', 'filters', 'section-body'])
  })
})
