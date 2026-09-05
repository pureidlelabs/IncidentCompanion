import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Section } from './section'

/**
 * Which of a section's slots reach the DOM, and how many headings it emits.
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
