import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Avatar } from './avatar'

/**
 * A disc with no name to carry is decoration, not an unnamed image.
 *
 * `aria-label` took the name as given, so a blank one produced
 * `role="img"` with nothing to announce. Whitespace is the case that reaches
 * here -- an analyst who cleared the field sends `'   '` rather than `''`.
 * -> #935
 */
describe('an avatar with no name announces nothing', () => {
  it.each(['', '   ', '\t'])('is not an image for %j', (name) => {
    render(<Avatar name={name} />)
    expect(
      screen.queryAllByRole('img'),
      'the disc claims to be an image and has no name to announce',
    ).toHaveLength(0)
  })

  it('stays an image when there is a name', () => {
    render(<Avatar name="Dana Okoro" />)
    expect(screen.getByRole('img', { name: 'Dana Okoro' })).toBeInTheDocument()
  })
})
