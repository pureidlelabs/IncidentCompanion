/**
 * The two marks that read a live feed.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ClaimBadge, PresenceStack, presenceTone } from './presence'

const people = (...names: string[]) => names.map((name) => ({ name }))

describe('PresenceStack', () => {
  it('draws one disc per person', () => {
    render(<PresenceStack people={people('R. Okonkwo', 'J. Mbeki')} />)
    expect(screen.getByLabelText(/R\. Okonkwo, J\. Mbeki/)).toBeInTheDocument()
  })

  it('draws nothing when nobody is in the case', () => {
    const { container } = render(<PresenceStack people={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('collapses the overflow into a count rather than growing', () => {
    render(<PresenceStack people={people('A', 'B', 'C', 'D', 'E', 'F')} max={4} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('names the hidden people somewhere reachable', () => {
    // Otherwise "+2" is the end of the trail: an analyst cannot find out who
    // else is in the case they are working on.
    render(<PresenceStack people={people('A', 'B', 'C', 'D', 'E')} max={4} />)
    expect(screen.getByText('+1')).toHaveAttribute('title', 'E')
  })

  it('labels the whole stack, including the people it did not draw', () => {
    render(<PresenceStack people={people('A', 'B', 'C', 'D', 'E')} max={4} />)
    expect(screen.getByLabelText('In this case: A, B, C, D, E')).toBeInTheDocument()
  })
})

describe('ClaimBadge', () => {
  it('says who is editing, in words', () => {
    // The whole reason a claim is not just a tint: three hues collide on a
    // fourth analyst, and guessing wrong here costs the edit.
    render(<ClaimBadge person={{ name: 'R. Okonkwo' }} />)
    expect(screen.getByText(/R\. Okonkwo editing/)).toBeInTheDocument()
  })

  it('draws nothing for yourself', () => {
    // Your own other tab holds the row as you. A badge telling an analyst
    // they are editing the field they are editing is noise.
    const { container } = render(
      <ClaimBadge person={{ name: 'R. Okonkwo', you: true }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('carries the holder\u2019s own tone, not a generic one', () => {
    const { container } = render(<ClaimBadge person={{ name: 'J. Mbeki' }} />)
    const tone = presenceTone({ name: 'J. Mbeki' })
    expect(container.firstElementChild?.className).toContain(tone.ink)
  })
})

describe('presenceTone', () => {
  it('gives one person the same tone every time', () => {
    // Derived from the name precisely so it needs no storage and no
    // coordination: the same analyst is the same colour on every screen and
    // every machine.
    expect(presenceTone({ name: 'R. Okonkwo' }))
      .toEqual(presenceTone({ name: 'R. Okonkwo' }))
  })

  it('gives the signed-in analyst the accent rather than a presence hue', () => {
    expect(presenceTone({ name: 'R. Okonkwo', you: true }).fill)
      .toContain('primary')
  })

  it('does not give every name the same tone', () => {
    // The weakest claim that is actually true. Three names landing on three
    // hues is not one of them: the design explicitly disclaims it -- there are
    // three buckets, so any two names collide about a
    // third of the time, and two of the three demo names duly did.
    //
    // What is worth guarding is that the function still distributes at all: a
    // change reducing it to a constant would paint every analyst the same
    // colour and pass every other test on this page.
    const tones = new Set(
      ['R. Okonkwo', 'J. Mbeki', 'A. Fournier', 'S. Ito', 'L. Haddad', 'P. Nowak']
        .map((name) => presenceTone({ name }).fill),
    )
    expect(tones.size).toBeGreaterThan(1)
  })

  it('collides rather than inventing a fourth hue, which is why names show', () => {
    // The stated cost, pinned so it is a decision rather than a surprise:
    // enough analysts and two of them share a colour. `ClaimBadge` writes the
    // name out for exactly this reason, and `PersonAvatar` carries initials.
    const many = Array.from({ length: 12 }, (_, n) => `Analyst ${String(n)}`)
    const tones = new Set(many.map((name) => presenceTone({ name }).fill))
    expect(tones.size).toBeLessThanOrEqual(3)
  })
})
