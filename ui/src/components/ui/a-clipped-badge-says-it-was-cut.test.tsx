import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from './badge'

/**
 * A badge that is cut short says so.
 *
 * `Badge` clips on purpose -- `max-w-full` with `overflow-hidden` is what lets
 * a caller constrain it -- and it carried no `text-overflow`, so the cut was
 * silent: `post-incident` read as `post-inciden` with nothing on screen saying
 * a character had gone. For a case's state that is a value an analyst reads to
 * decide what to do. -> #896
 *
 * jsdom lays nothing out, so nothing here is a width claim; whether the cut
 * happens at all is the browser tier's, through the walk's `clipped-text`
 * rule, which fires only where `overflow` is hidden and `text-overflow` is not
 * `ellipsis`.
 */
describe('a clipped badge says it was cut', () => {
  it('declares an ellipsis for the text it clips', () => {
    render(<Badge>post-incident</Badge>)
    const classes = screen.getByText('post-incident').className.split(/\s+/)

    expect(classes, 'the badge clips its text and shows nothing for what it cut').toContain(
      'text-ellipsis',
    )
  })

  it('still clips, so the ellipsis has something to mark', () => {
    // The pair only works together: `text-ellipsis` draws nothing without an
    // overflow to mark, and the overflow alone is the silent cut.
    render(<Badge>post-incident</Badge>)
    const classes = screen.getByText('post-incident').className.split(/\s+/)

    expect(classes).toContain('overflow-hidden')
    expect(classes).toContain('whitespace-nowrap')
  })
})
