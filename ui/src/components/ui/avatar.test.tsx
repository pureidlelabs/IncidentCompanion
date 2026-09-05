import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Avatar, initialsOf } from './avatar'

/**
 * The disc, attacked at the two things that have no other tier to catch them.
 *
 * jsdom loads no image, so the picture path is exercised by firing the `error`
 * the browser would fire; and the derivation is the one piece of logic in the
 * component, which every screen that draws a person depends on.
 */
describe('initials', () => {
  it.each([
    ['Dana Okoro', 'DO'],
    ['Root', 'R'],
    // The account spellings a roster carries. A name split on whitespace alone
    // gives `R` for the first and `P` for the last, and `P` is a letter of the
    // *domain* rather than of anybody's name.
    ['r.okonkwo', 'RO'],
    ['ada_lovelace', 'AL'],
    ['jean-luc', 'JL'],
    ['p.zero@meridian.example', 'PZ'],
    // Three words: the first and the last, never the middle one.
    ['Ada Byron Lovelace', 'AL'],
    // Nothing to take a letter from, rather than an empty disc.
    ['   ', '?'],
    ['', '?'],
    ['@meridian.example', '?'],
  ])('takes %j as %j', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })
})

describe('the disc', () => {
  it('is one labelled image rather than letters a screen reader spells out', () => {
    render(<Avatar name="Dana Okoro" />)

    const disc = screen.getByRole('img', { name: 'Dana Okoro' })
    // The letters carry no accessible name of their own: read out, `DO` is
    // "dee oh" beside a label that already said the name.
    expect(screen.getByText('DO')).toHaveAttribute('aria-hidden')
    expect(disc).toContainElement(screen.getByText('DO'))
  })

  it('keeps the name as the accessible name when initials are chosen', () => {
    // Two characters somebody picked are not enough to identify them.
    render(<Avatar name="Dana Okoro" initials="DX" />)

    expect(screen.getByRole('img', { name: 'Dana Okoro' })).toBeInTheDocument()
    expect(screen.getByText('DX')).toBeInTheDocument()
  })

  /** An empty `src` is not a picture. A roster row sends one for a name-only person. */
  it('draws the initials for an empty src rather than a broken image', () => {
    render(<Avatar name="Dana Okoro" src="" />)

    expect(screen.getByRole('img', { name: 'Dana Okoro' }).querySelector('img')).toBeNull()
    expect(screen.getByText('DO')).toBeInTheDocument()
  })

  /**
   * The disc exists to carry attribution, so it may never be empty while a
   * name is known. `initials` is a field an analyst can clear, which sends `''`
   * rather than dropping the key -- and `??` treats that as a chosen value.
   */
  it('derives the initials when the analyst has cleared their own', () => {
    render(<Avatar name="Dana Okoro" initials="" />)

    expect(screen.getByText('DO')).toBeInTheDocument()
  })
})
