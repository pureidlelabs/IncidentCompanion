/**
 * A chosen tone and chosen initials, against the derived defaults.
 *
 * **What matters is that choosing changes nothing for anybody else.** The hash
 * is the default and stays it, so an install where nobody has chosen looks
 * exactly as it did - and one analyst picking a colour must not move a
 * colleague's.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PersonAvatar, presenceColor, presenceTone } from './presence'

describe('a chosen tone', () => {
  it('overrides the one derived from the name', () => {
    const derived = presenceTone({ name: 'r.okonkwo' })
    const chosen = presenceTone({ name: 'r.okonkwo', tone: 2 })

    expect(chosen.fill).toContain('presence-3')
    expect(chosen.fill).not.toBe(derived.fill)
  })

  it('wins even for the signed-in analyst', () => {
    // Being "you" is a default, not an override: somebody who picks a colour
    // has said which one they want to be on their own screen as well.
    expect(presenceTone({ name: 'me', you: true, tone: 0 }).fill)
      .toContain('presence-1')
    expect(presenceTone({ name: 'me', you: true }).fill).toContain('primary')
  })

  it('leaves everybody else where they were', () => {
    const before = presenceTone({ name: 'j.mensah' })
    presenceTone({ name: 'r.okonkwo', tone: 1 })

    expect(presenceTone({ name: 'j.mensah' }).fill).toBe(before.fill)
  })

  it('falls back rather than painting nothing when it is out of range', () => {
    // The server refuses an out-of-range tone, so this is the second line -
    // a palette that shrinks would otherwise leave stored choices resolving
    // to a CSS variable that does not exist.
    expect(presenceTone({ name: 'x', tone: 99 }).fill).toContain('primary')
  })

  it('reaches the CSS-variable accessor the caret uses', () => {
    expect(presenceColor({ name: 'x', tone: 1 })).toBe('var(--presence-2)')
    expect(presenceColor({ name: 'x', you: true, tone: 1 }))
      .toBe('var(--presence-2)')
  })
})

describe('chosen initials', () => {
  it('are drawn instead of the ones derived from the name', () => {
    render(<PersonAvatar person={{ name: 'Rachel Okonkwo', initials: 'RX' }} />)

    expect(screen.getByText('RX')).toBeTruthy()
  })

  it('fall back to the name when unset', () => {
    render(<PersonAvatar person={{ name: 'Rachel Okonkwo' }} />)

    expect(screen.getByText('RO')).toBeTruthy()
  })

  it('do not become the accessible name', () => {
    // Two characters somebody chose are not enough to identify them, and the
    // disc is often the only thing on screen saying who did something.
    render(<PersonAvatar person={{ name: 'Rachel Okonkwo', initials: 'RX' }} />)

    expect(screen.getByTitle('Rachel Okonkwo')).toBeTruthy()
  })
})
